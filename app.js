// === CONFIGURATION ET ÉTAT GLOBAL ===
const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let donneesCloud = [];
let estAdmin = false;
let estAbonne = false;
let ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
let importAttente = null;

// Cache et paramètres
const CACHE_TTL_MS = 30000;
const PAGE_SIZE = 200;
let cacheTimestamp = 0;
let chargementEnCours = false;
let plusAncienCharge = null;

// Map pour filtrer par sac
const sacsMap = {
  tous: null,
  Star: ['Star'],
  Fortune: ['Fortune'],
  Digital: ['Digital'],
  Star_Digital: ['Star', 'Digital'],
  Fortune_Digital: ['Fortune', 'Digital'],
  Star_Fortune: ['Star', 'Fortune'],
  Star_Fortune_Digital: null,
};

// === FONCTIONS D’UTILITÉ ===
const filtrerParSac = (sacId) => {
  const jeux = sacsMap[sacId];
  if (!jeux) return donneesCloud;
  return donneesCloud.filter(t => jeux.includes(t.jeu));
};

// === GESTION DU MENU ET ATELIERS ===
const ouvrirDrawer = () => {
  document.getElementById('drawerMenu').classList.add('open');
  document.getElementById('drawerBackdrop').classList.add('open');
};
const fermerDrawer = () => {
  document.getElementById('drawerMenu').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
};
const seDeconnecterDepuisDrawer = () => {
  fermerDrawer();
  seDeconnecter();
};
  
const majBarreAteliers = () => {
  const bar = document.getElementById('ateliersBar');
  const topOnglets = ['saisie', 'cockpit', 'analyses'];
  const ateliersFiltres = ateliersOuverts.filter(id => !topOnglets.includes(id));
  if (!ateliersFiltres.length) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  ateliersFiltres.forEach(id => {
    const btnOnglet = document.getElementById('tab-' + id);
    const icone = btnOnglet ? btnOnglet.textContent.trim().split(' ')[0] : '🔧';
    const btn = document.createElement('button');
    btn.className = 'atelier-btn' + (document.getElementById('onglet-' + id).classList.contains('active') ? ' active' : '');
    btn.innerHTML = `${icone}<span class='atelier-close' onclick='retirerAtelier(event, "${id}")'>✕</span>`;
    btn.onclick = () => _ouvrirOnglet(id, btnOnglet);
    bar.appendChild(btn);
  });
};

// === NAVIGATION ===
const _ouvrirOnglet = (id, btn) => {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(t => {
    const selected = t.id === 'tab-' + id;
    t.setAttribute('aria-selected', selected);
    t.classList.toggle('active', selected);
  });
  panels.forEach(p => {
    p.classList.toggle('active', p.id === 'onglet-' + id);
  });
  ajouterAtelier(id);
  majBarreAteliers();
  if (btn) btn.focus();

  // Actions spécifiques par onglet
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') remplirSelecteursLabo();
  if (id === 'boules') remplirBoulesGrid();
  if (id === 'analyses') executerAnalyses();
};
const ouvrirOnglet = (id, btn) => _ouvrirOnglet(id, btn);
const ouvrirOngletDepuisDrawer = id => {
  fermerDrawer();
  _ouvrirOnglet(id, document.getElementById('tab-' + id));
};

// === AUTHENTIFICATION & SESSION ===
async function verifierSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
    return;
  }
  const { data: profil, error } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
  if (error || !profil) {
    estAdmin = false;
    estAbonne = false;
  } else {
    const role = profil.role || 'visiteur';
    const dateFinAb = new Date(profil.date_fin_abonnement || 0);
    const dateValide = dateFinAb > new Date();
    estAdmin = role === 'admin';
    estAbonne = estAdmin || dateValide;
    afficherApplication(estAdmin, estAbonne, dateValide ? dateFinAb : null);
  }
}

async function seConnecter() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const msg = document.getElementById('loginMessage');
  msg.textContent = 'Connexion...';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = `❌ ${error.message}`;
  } else {
    msg.textContent = '✅';
    setTimeout(verifierSession, 500);
  }
}

async function creerCompte() {
  const email = document.getElementById('insEmail').value.trim();
  const phone = document.getElementById('insPhone').value.trim();
  const password = document.getElementById('insPassword').value.trim();
  const msg = document.getElementById('loginMessage');

  if (!email || !phone || !password) {
    msg.textContent = 'Remplissez tout.';
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email, password, options: { data: { telephone: phone } }
  });

  if (error) {
    msg.textContent = `❌ ${error.message}`;
  } else {
    msg.textContent = '✅ Compte créé !';
    setTimeout(afficherConnexion, 2000);
  }
}

function entrerVisiteur() {
  estAdmin = false;
  estAbonne = false;
  afficherApplication(false, false, null);
}

async function seDeconnecter() {
  await supabaseClient.auth.signOut();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-content').style.display = 'none';
  afficherConnexion();
}

function afficherConnexion() {
  document.getElementById('form-inscription').hidden = true;
  document.getElementById('form-connexion').hidden = false;
  document.getElementById('loginMessage').textContent = '';
}

function afficherInscription() {
  document.getElementById('form-connexion').hidden = true;
  document.getElementById('form-inscription').hidden = false;
  document.getElementById('loginMessage').textContent = '';
}

function afficherApplication(isAdmin, isAbonne, dateFin) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';

  const badgeEl = document.getElementById('statusBadge');
  if (isAdmin) {
    badgeEl.textContent = '👑 Admin';
    badgeEl.className = 'status-badge badge-admin';
    document.body.classList.remove('mode-visiteur');
  } else if (isAbonne) {
    badgeEl.textContent = '⭐ Abonné';
    badgeEl.className = 'status-badge badge-abonne';
    document.body.classList.remove('mode-visiteur');
  } else {
    badgeEl.textContent = '🚫 Gratuit';
    badgeEl.className = 'status-badge badge-gratuit';
    document.body.classList.add('mode-visiteur');
  }

  const drawerBadge = document.getElementById('drawerBadge');
  if (drawerBadge) {
    drawerBadge.textContent = badgeEl.textContent;
    drawerBadge.className = badgeEl.className;
  }

  const dash = document.getElementById('dashboardAdmin');
  if (dash) dash.style.display = isAdmin ? 'block' : 'none';

  chargerDonnees();
  if (isAdmin) chargerUtilisateursAuto();
}

// === CHARGEMENT DES DONNÉES & AFFICHAGE ===
// (fonctions chargerDonnees, afficherSacSelectionne, etc.)

// === ÉVÉNEMENTS ET INTERACTIONS ===
document.getElementById('btnAjouter')?.addEventListener('click', async () => {
  if (!estAdmin) return;
  // code d'ajout simplifié ici...
});

// Charger plus anciens, cockpit, labo, analyses, etc.  
// Découper en fonctions plus petites et claires...

// === INITIALISATION ===
document.addEventListener('DOMContentLoaded', () => {
  const tailleBoules = localStorage.getItem('loto_taille_boules') || 'taille-normale';
  document.body.className = tailleBoules;
  const selectTaille = document.getElementById('selectTailleBoules');
  if (selectTaille) selectTaille.value = tailleBoules;
  const dateInput = document.getElementById('date');
  if (dateInput) dateInput.valueAsDate = new Date();
  verifierSession();
});
