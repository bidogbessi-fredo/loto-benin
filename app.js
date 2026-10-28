// Configuration Supabase
const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Variables globales
let donneesCloud = [];
let estAdmin = false;
let estAbonne = false;
let ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
let importAttente = null;

const CACHE_TTL_MS = 30000;
const PAGE_SIZE = 200;
let cacheTimestamp = 0;
let chargementEnCours = false;
let plusAncienCharge = null;

const sacsMap = {
  tous: null,
  Star: ['Star'],
  Fortune: ['Fortune'],
  Digital: ['Digital'],
  Star_Digital: ['Star', 'Digital'],
  Fortune_Digital: ['Fortune', 'Digital'],
  Star_Fortune: ['Star', 'Fortune'],
  Star_Fortune_Digital: null
};

// Utilitaires
function filtrerParSac(sacId) {
  const jeux = sacsMap[sacId];
  return !jeux ? donneesCloud : donneesCloud.filter(t => jeux.includes(t.jeu));
}

// MENU & ATELIERS
function ouvrirDrawer() {
  const drawer = document.getElementById('drawerMenu');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    backdrop.classList.add('open');
  }
}

function fermerDrawer() {
  const drawer = document.getElementById('drawerMenu');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
  }
}

function seDeconnecterDepuisDrawer() {
  fermerDrawer();
  seDeconnecter();
}

function majBarreAteliers() {
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
}

function ajouterAtelier(id) {
  if (['saisie', 'cockpit', 'analyses'].includes(id)) return;
  if (!ateliersOuverts.includes(id)) {
    ateliersOuverts.push(id);
    localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts));
  }
  majBarreAteliers();
}

function retirerAtelier(e, id) {
  e.stopPropagation();
  ateliersOuverts = ateliersOuverts.filter(a => a !== id);
  localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts));
  majBarreAteliers();
  if (document.getElementById('onglet-' + id).classList.contains('active')) {
    _ouvrirOnglet('saisie', document.getElementById('tab-saisie'));
  }
}

// NAVIGATION ONGLET
function _ouvrirOnglet(id, btn) {
  document.querySelectorAll('[role="tab"]').forEach(t => {
    const selected = t.id === 'tab-' + id;
    t.setAttribute('aria-selected', selected);
    t.classList.toggle('active', selected);
  });
  document.querySelectorAll('[role="tabpanel"]').forEach(p => {
    p.classList.toggle('active', p.id === 'onglet-' + id);
  });
  ajouterAtelier(id);
  majBarreAteliers();
  if (btn) btn.focus();
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') remplirSelecteursLabo();
  if (id === 'boules') remplirBoulesGrid();
  if (id === 'analyses') executerAnalyses();
}

function ouvrirOnglet(id, btn) {
  _ouvrirOnglet(id, btn);
}

function ouvrirOngletDepuisDrawer(id) {
  fermerDrawer();
  _ouvrirOnglet(id, document.getElementById('tab-' + id));
}

// AUTHENTIFICATION & SESSION
async function verifierSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-content').hidden = true;
    return;
  }
  const { data: profil, error } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
  estAdmin = profil && profil.role === 'admin';
  estAbonne = estAdmin || (profil && new Date(profil.date_fin_abonnement || 0) > new Date());
  afficherApplication(estAdmin, estAbonne);
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
  afficherApplication(false, false);
}

async function seDeconnecter() {
  await supabaseClient.auth.signOut();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-content').hidden = true;
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

function afficherApplication(isAdmin, isAbonne) {
  document.getElementById('login-screen').style.display = 'none';
  const appContent = document.getElementById('app-content');
  appContent.hidden = false;

  const badgeEl = document.getElementById('statusBadge');
  const drawerBadge = document.getElementById('drawerBadge');

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
  if (drawerBadge) {
    drawerBadge.textContent = badgeEl.textContent;
    drawerBadge.className = badgeEl.className;
  }

  chargerDonnees();
  if (isAdmin) chargerUtilisateursAuto();
}

// CHARGEMENT DONNÉES
async function chargerDonnees(force = false) {
  if (chargementEnCours) return;
  if (!force && donneesCloud.length && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) return;

  chargementEnCours = true;
  const statusEl = document.getElementById('statusCloud');
  if(statusEl) statusEl.textContent = '⏳ Chargement...';

  try {
    const { data, error } = await supabaseClient
      .from('tirages')
      .select('*')
      .order('date', { ascending: false })
      .order('heure', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) throw error;

    donneesCloud = (data || []).map(t => {
      const boules = typeof t.boules === 'string' ? JSON.parse(t.boules) : t.boules;
      return { ...t, boules, somme: boules.reduce((a,b) => a+b, 0) };
    });

    donneesCloud.reverse();
    plusAncienCharge = donneesCloud.length ? donneesCloud[0].date : null;
    cacheTimestamp = Date.now();

    if(statusEl) statusEl.textContent = `✅ Connecté ! (${donneesCloud.length} tirages récents)`;

    afficherSacSelectionne();
    actualiserDashboard();
  } catch(err) {
    console.error(err);
    if(statusEl) statusEl.textContent = '❌ Erreur chargement';
  }
  chargementEnCours = false;
}

// AFFICHAGE SAC SÉLECTIONNÉ
function afficherSacSelectionne() {
  const sacSelect = document.getElementById('selectSac');
  const filtreSelect = document.getElementById('filtrePeriode');
  const conteneur = document.getElementById('conteneurSac');

  if (!sacSelect || !filtreSelect || !conteneur) {
    console.warn('Eléments manquants pour afficherSacSelectionne');
    return;
  }

  const sacId = sacSelect.value;
  const filtre = filtreSelect.value;

  let tiragesFiltres = filtrerParSac(sacId);

  if(filtre === 'recent') {
    const today = new Date().toISOString().slice(0,10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    tiragesFiltres = tiragesFiltres.filter(t => t.date === today || t.date === yesterday);
  } else if(filtre ==='mois') {
    const currentMonth = new Date().toISOString().slice(0,7);
    tiragesFiltres = tiragesFiltres.filter(t => t.date.startsWith(currentMonth));
  }

  if (tiragesFiltres.length === 0) {
    conteneur.innerHTML = '<p>Aucun tirage.</p>';
    return;
  }

  const LIMIT = 100;
  const tiragesAffiches = tiragesFiltres.slice(-LIMIT).reverse();

  const parDate = tiragesAffiches.reduce((acc, tirage) => {
    (acc[tirage.date] = acc[tirage.date] || []).push(tirage);
    return acc;
  }, {});

  const fragment = document.createDocumentFragment();

  Object.keys(parDate).sort().reverse().forEach(dateStr => {
    const dObj = new Date(dateStr);
    const df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const dayCard = document.createElement('div');
    dayCard.className = 'day-card';

    const h3 = document.createElement('h3');
    h3.className = 'day-header';
    h3.textContent = `📅 ${df}`;
    dayCard.appendChild(h3);

    parDate[dateStr].forEach(t => {
      const gameClass = t.jeu.toLowerCase();
      const row = document.createElement('div');
      row.className = 'day-row';

      const time = document.createElement('div');
      time.className = 'day-time';
      time.textContent = t.heure;

      const game = document.createElement('div');
      game.className = 'day-game';
      game.textContent = t.jeu;

      const nums = document.createElement('div');
      nums.className = 'day-nums';
      t.boules.forEach(boule => {
        const span = document.createElement('span');
        span.className = `ball ${gameClass}`;
        span.textContent = boule;
        nums.appendChild(span);
      });

      row.append(time, game, nums);
      dayCard.appendChild(row);
    });

    fragment.appendChild(dayCard);
  });

  conteneur.innerHTML = '';
  conteneur.appendChild(fragment);
  conteneur.style.display = 'block';
}

// DASHBOARD ADMIN
function actualiserDashboard() {
  const dashTotal = document.getElementById('dashTotal');
  const dashStar = document.getElementById('dashStar');
  const dashFortune = document.getElementById('dashFortune');
  const dashDigital = document.getElementById('dashDigital');
  const dashDerniereDate = document.getElementById('dashDerniereDate');

  if (!(dashTotal && dashStar && dashFortune && dashDigital && dashDerniereDate)) {
    console.warn('Éléments dashboard manquants');
    return;
  }

  dashTotal.textContent = donneesCloud.length;
  dashStar.textContent = donneesCloud.filter(t => t.jeu === 'Star').length;
  dashFortune.textContent = donneesCloud.filter(t => t.jeu === 'Fortune').length;
  dashDigital.textContent = donneesCloud.filter(t => t.jeu === 'Digital').length;

  if (donneesCloud.length > 0) {
    const maxDate = donneesCloud.reduce((max, t) => (t.date > max ? t.date : max), donneesCloud[0].date);
    dashDerniereDate.textContent = new Date(maxDate).toLocaleDateString('fr-FR');
  } else {
    dashDerniereDate.textContent = '—';
  }
}

// STUB pour chargerUtilisateursAuto (remplace par ton implémentation si disponible)
async function chargerUtilisateursAuto() {
  console.warn('chargerUtilisateursAuto appelée - à implémenter');
  // Tu peux y mettre le code d’affichage des utilisateurs admin ici
}

document.addEventListener('DOMContentLoaded', () => {
  verifierSession();

  // Liens événements inline existants dans le HTML appellent bien les fonctions globales ici
});
