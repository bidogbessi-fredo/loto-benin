const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

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

const filtrerParSac = sacId => {
  const jeux = sacsMap[sacId];
  return !jeux ? donneesCloud : donneesCloud.filter(t => jeux.includes(t.jeu));
};

const afficherSacSelectionne = () => {
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

  if (filtre === 'recent') {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    tiragesFiltres = tiragesFiltres.filter(t => t.date === today || t.date === yesterday);
  } else if (filtre === 'mois') {
    const currentMonth = new Date().toISOString().slice(0, 7);
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
};

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

async function chargerDonnees(force = false) {
  const statusEl = document.getElementById('statusCloud');
  if (chargementEnCours) return;
  if (!force && donneesCloud.length && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) return;

  chargementEnCours = true;
  if (statusEl) statusEl.textContent = '⏳ Chargement...';

  try {
    const { data, error } = await supabaseClient.from('tirages').select('*').order('date', { ascending: false }).order('heure', { ascending: false }).limit(PAGE_SIZE);
    if (error) throw error;

    donneesCloud = (data || []).map(t => {
      const boules = typeof t.boules === 'string' ? JSON.parse(t.boules) : t.boules;
      return { ...t, boules, somme: boules.reduce((a, b) => a + b, 0) };
    });
    donneesCloud.reverse();
    plusAncienCharge = donneesCloud.length ? donneesCloud[0].date : null;
    cacheTimestamp = Date.now();

    if (statusEl) statusEl.textContent = `✅ Connecté ! (${donneesCloud.length} tirages récents)`;

    afficherSacSelectionne();
    actualiserDashboard();
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = '❌ Erreur chargement';
  } finally {
    chargementEnCours = false;
  }
}

async function verifierSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-content').hidden = true;
    return;
  }

  const { data: profil } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
  
  estAdmin = profil?.role === 'admin';
  estAbonne = estAdmin || (new Date(profil?.date_fin_abonnement || 0) > new Date());

  afficherApplication(estAdmin, estAbonne);
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

// Fonction chargement utilisateurs (identique à ce qu’on a vu)
// Je te laisse intégrer ou me redemander si besoin.

document.addEventListener('DOMContentLoaded', () => {
  verifierSession();
  // autres initialisations au besoin...
});
