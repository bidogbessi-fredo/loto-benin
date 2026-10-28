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

function filtrerParSac(sacId) {
  const jeux = sacsMap[sacId];
  return !jeux ? donneesCloud : donneesCloud.filter(t => jeux.includes(t.jeu));
}

// Code complet avec fonctions globales utilisées par HTML (ex: ouvrirDrawer, ouvrirOnglet, etc.)
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
  if(id==='cockpit') actualiserCockpit();
  if(id==='recherche') initialiserRecherche();
  if(id==='labo') remplirSelecteursLabo();
  if(id==='boules') remplirBoulesGrid();
  if(id==='analyses') executerAnalyses();
}

function ouvrirOnglet(id, btn) {_ouvrirOnglet(id, btn);}
function ouvrirOngletDepuisDrawer(id) {
  fermerDrawer();
  _ouvrirOnglet(id, document.getElementById('tab-' + id));
}

document.addEventListener('DOMContentLoaded', () => {
  verifierSession();

  // Lien des boutons drawer-nav-btn vers onglets
  document.querySelectorAll('.drawer-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ouvrirOngletDepuisDrawer(btn.dataset.onglet);
    });
  });

  // Bouton burger
  const burgerBtn = document.getElementById('btnBurger');
  if(burgerBtn) burgerBtn.addEventListener('click', ouvrirDrawer);

  // Fermeture drawer
  const drawerClose = document.querySelector('.drawer-close');
  if(drawerClose) drawerClose.addEventListener('click', fermerDrawer);

  const drawerBackdrop = document.getElementById('drawerBackdrop');
  if(drawerBackdrop) drawerBackdrop.addEventListener('click', fermerDrawer);
});

// Implémenter ou reprendre toutes autres fonctions (ex: seConnecter, creerCompte, etc.) ici bas...

// N’oublie pas de vérifier chaque accès DOM par getElementById avant utilisation pour éviter les erreurs.

