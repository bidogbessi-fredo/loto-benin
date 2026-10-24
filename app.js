const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var couleurActive = '#e74c3c';
var estAdmin = false;
var estAbonne = false;
var modeDemoActif = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker enregistré ! Mode hors-ligne actif.'))
      .catch(err => console.log('Erreur Service Worker', err));
  });
}

(function activerProtectionCopie() {
    document.addEventListener('copy', function(e) {
        var c = e.target;
        if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
        if (c && c.closest && c.closest('.modal-box')) return;
        e.preventDefault(); return false;
    }, true);
    document.addEventListener('cut', function(e) {
        var c = e.target;
        if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
        if (c && c.closest && c.closest('.modal-box')) return;
        e.preventDefault(); return false;
    }, true);
    document.addEventListener('contextmenu', function(e) {
        var c = e.target;
        if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return;
        if (c && c.closest && c.closest('.modal-box')) return;
        e.preventDefault(); return false;
    }, true);
})();

var DATE_LANCEMENT_STAR    = new Date("2004-06-16");
var DATE_LANCEMENT_FORTUNE = new Date("2010-04-28");
var DATE_LANCEMENT_DIGITAL = new Date("2023-07-13");
var DATE_AJOUT_11H         = new Date("2023-07-13");
var DATE_AJOUT_08H         = new Date("2026-08-13");

function heuresPourJeu(jeu, dateObj) {
    if (jeu === 'Star') {
        if (dateObj < DATE_LANCEMENT_STAR) return [];
        if (dateObj < DATE_AJOUT_11H) return ["14H", "18H"];
        return ["11H", "14H", "18H"];
    }
    if (jeu === 'Fortune') {
        if (dateObj < DATE_LANCEMENT_FORTUNE) return [];
        if (dateObj < DATE_AJOUT_11H) return ["14H", "18H"];
        return ["11H", "14H", "18H"];
    }
    if (jeu === 'Digital') {
        if (dateObj < DATE_LANCEMENT_DIGITAL) return [];
        if (dateObj < DATE_AJOUT_08H) return ["00H", "20H"];
        return ["00H", "08H", "20H"];
    }
    return [];
}

var GRILLE_GAINS_LNB = {
  1: { multiplicateur: 2, gainPour100: 200 },
  2: { multiplicateur: 250, gainPour100: 25000 },
  3: { multiplicateur: 2500, gainPour100: 250000 },
  4: { multiplicateur: 7500, gainPour100: 750000 },
  5: { multiplicateur: 45000, gainPour100: 4500000 }
};

var DONNEES_DEMO = [
  { date: "2025-01-08", heure: "14H", jeu: "Star",    boules: [12, 27, 45, 63, 78] },
  { date: "2025-01-08", heure: "18H", jeu: "Star",    boules: [5, 19, 34, 56, 82] },
  { date: "2025-01-09", heure: "14H", jeu: "Fortune", boules: [8, 22, 41, 59, 71] },
  { date: "2025-01-09", heure: "18H", jeu: "Fortune", boules: [3, 15, 33, 48, 90] },
  { date: "2025-01-10", heure: "14H", jeu: "Fortune", boules: [11, 29, 44, 67, 75] },
  { date: "2025-01-10", heure: "18H", jeu: "Fortune", boules: [7, 18, 39, 52, 88] },
  { date: "2025-01-11", heure: "14H", jeu: "Star",    boules: [14, 25, 36, 58, 79] },
  { date: "2025-01-11", heure: "18H", jeu: "Star",    boules: [2, 21, 43, 61, 85] },
  { date: "2025-01-12", heure: "14H", jeu: "Star",    boules: [9, 28, 47, 64, 81] },
  { date: "2025-01-12", heure: "18H", jeu: "Star",    boules: [6, 17, 38, 55, 72] }
];

var audioMuet = (localStorage.getItem('loto_audio_muet') === 'true');
var derniereComparaison = null;

function initialiserBoutonMuet() {
    var btn = document.getElementById('btnMuet');
    if (!btn) return;
    if (audioMuet) { btn.textContent = "🔊 Activer le son"; btn.setAttribute('aria-pressed', 'false'); }
    else { btn.textContent = "🔇 Muet"; btn.setAttribute('aria-pressed', 'true'); }
}
function basculerMuet() {
    audioMuet = !audioMuet;
    localStorage.setItem('loto_audio_muet', audioMuet ? 'true' : 'false');
    var btn = document.getElementById('btnMuet'), etat = document.getElementById('etatAudio');
    if (audioMuet) {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        btn.textContent = "🔊 Activer le son"; btn.setAttribute('aria-pressed', 'false');
        if (etat) etat.textContent = "Son désactivé.";
    } else {
        btn.textContent = "🔇 Muet"; btn.setAttribute('aria-pressed', 'true');
        if (etat) etat.textContent = "Son activé.";
    }
}
function lireTexteVocal(texte) {
    if (audioMuet || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR'; u.rate = 1.05; u.pitch = 1;
    var voix = window.speechSynthesis.getVoices().find(function(v) { return v.lang && v.lang.toLowerCase().indexOf('fr') === 0; });
    if (voix) u.voice = voix;
    window.speechSynthesis.speak(u);
}
function annoncerResumeComparaison(plages, statsParPlage) {
    var parties = [];
    statsParPlage.forEach(function(s) { parties.push("Plage " + s.nom + " : " + s.exact + " identique(s), " + s.miroir + " miroir(s)"); });
    var texte = "Comparaison terminée sur " + plages.length + " plages. " + parties.join(". ") + ".";
    var zone = document.getElementById('annonceComparaison');
    if (zone) { zone.textContent = ""; setTimeout(function() { zone.textContent = texte; }, 50); }
    if (!audioMuet) lireTexteVocal(texte);
}
function construireTexteDetail(plages) {
    if (!plages || plages.length === 0) return "Aucune comparaison à lire.";
    var phrases = ["Détail de la comparaison."];
    plages.forEach(function(p) {
        phrases.push("Colonne " + p.id + ", " + p.nomSac + ".");
        p.data.forEach(function(item) {
            if (!item) return;
            var t = item.data;
            var d = t.date ? new Date(t.date) : null;
            var dateLisible = d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : t.date;
            phrases.push("Ligne " + item.ligneLocale + ", " + dateLisible + ", " + t.heure + ", " + t.jeu + ". Boules : " + t.boules.join(", ") + ".");
        });
    });
    return phrases.join(" ");
}
function lireDetailComparaison() {
    if (!derniereComparaison) { alert("Lance d'abord une comparaison."); return; }
    if (audioMuet) { var etat = document.getElementById('etatAudio'); if (etat) etat.textContent = "Son désactivé."; return; }
    lireTexteVocal(construireTexteDetail(derniereComparaison));
}

var drawerOuvert = false, focusAvantDrawer = null;
function ouvrirDrawer() {
    focusAvantDrawer = document.activeElement; drawerOuvert = true;
    document.getElementById('drawerMenu').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('drawerBackdrop').setAttribute('aria-hidden', 'false');
    document.getElementById('btnBurger').setAttribute('aria-expanded', 'true');
    var db = document.getElementById('drawerBadge'), mb = document.getElementById('statusBadge');
    if (db && mb) { db.textContent = mb.textContent; db.className = mb.className; }
    var actif = document.querySelector('.tab-content.active');
    if (actif) {
        var id = actif.id.replace('onglet-', '');
        document.querySelectorAll('.drawer-nav-btn').forEach(function(b) {
            if (b.dataset.onglet === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
    }
    setTimeout(function() { var c = document.querySelector('#drawerMenu .drawer-close'); if (c) c.focus(); }, 50);
    document.addEventListener('keydown', piegeFocusDrawer);
}
function fermerDrawer() {
    drawerOuvert = false;
    document.getElementById('drawerMenu').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
    document.getElementById('drawerBackdrop').setAttribute('aria-hidden', 'true');
    document.getElementById('btnBurger').setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', piegeFocusDrawer);
    if (focusAvantDrawer && focusAvantDrawer.focus) focusAvantDrawer.focus();
}
function piegeFocusDrawer(e) {
    if (!drawerOuvert) return;
    if (e.key === 'Escape') { e.preventDefault(); fermerDrawer(); return; }
    if (e.key !== 'Tab') return;
    var d = document.getElementById('drawerMenu');
    var f = d.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (f.length === 0) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); var b = document.getElementById('tab-' + id); _ouvrirOnglet(id, b); }
function seDeconnecterDepuisDrawer() { fermerDrawer(); seDeconnecter(); }

function afficherInscription() {
    document.getElementById("form-connexion").style.display = "none";
    document.getElementById("form-inscription").style.display = "block";
    document.getElementById("loginMessage").textContent = "";
    document.getElementById("insEmail").focus();
}
function afficherConnexion() {
    document.getElementById("form-inscription").style.display = "none";
    document.getElementById("form-connexion").style.display = "block";
    document.getElementById("loginMessage").textContent = "";
    document.getElementById("loginEmail").focus();
}
async function verifierSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profil } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
        let role = profil ? profil.role : 'visiteur';
        let dateFin = null, dateValide = false;
        if (profil && profil.date_fin_abonnement) {
            dateFin = new Date(profil.date_fin_abonnement);
            dateValide = !isNaN(dateFin.getTime());
        }
        estAdmin = (role === 'admin');
        estAbonne = (role === 'admin') || (dateValide && dateFin > new Date());
        afficherApplication(session.user.email, estAdmin, estAbonne, dateValide ? dateFin : null);
    } else {
        document.getElementById("login-screen").style.display = "flex";
        document.getElementById("app-content").style.display = "none";
        document.getElementById("loginEmail").focus();
    }
}
async function seConnecter() {
    var email = document.getElementById("loginEmail").value;
    var password = document.getElementById("loginPassword").value;
    var msg = document.getElementById("loginMessage");
    if (!email || !password) { msg.style.color = "var(--color-hot)"; msg.textContent = "Remplissez les champs."; return; }
    msg.style.color = "var(--primary)"; msg.textContent = "Connexion...";
    const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) { msg.style.color = "var(--color-hot)"; msg.textContent = "❌ " + error.message; }
    else { msg.style.color = "#27ae60"; msg.textContent = "✅ Connecté !"; setTimeout(() => { verifierSession(); }, 500); }
}
async function creerCompte() {
    var email = document.getElementById("insEmail").value;
    var password = document.getElementById("insPassword").value;
    var msg = document.getElementById("loginMessage");
    if (!email || !password) { msg.style.color = "var(--color-hot)"; msg.textContent = "Remplissez les champs."; return; }
    if (password.length < 6) { msg.style.color = "var(--color-hot)"; msg.textContent = "6 caractères min."; return; }
    msg.style.color = "var(--primary)"; msg.textContent = "Création...";
    const { error } = await supabaseClient.auth.signUp({ email: email, password: password });
    if (error) { msg.style.color = "var(--color-hot)"; msg.textContent = "❌ " + error.message; }
    else { msg.style.color = "#27ae60"; msg.textContent = "✅ Compte créé ! Connectez-vous."; setTimeout(() => { afficherConnexion(); }, 2000); }
}
function entrerVisiteur() { estAdmin = false; estAbonne = false; afficherApplication("Visiteur", false, false, null); }
async function seDeconnecter() {
    await supabaseClient.auth.signOut();
    ["loginEmail","loginPassword","insEmail","insPassword"].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=""; });
    document.getElementById("loginMessage").textContent = "";
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app-content").style.display = "none";
    document.body.classList.remove("mode-visiteur");
    document.getElementById("bandeauExpiration").classList.remove("visible");
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    afficherConnexion();
}

function afficherApplication(nomUtilisateur, isAdmin, isAbonne, dateFin) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    var badgeEl = document.getElementById("statusBadge");
    var bandeau = document.getElementById("bandeauExpiration");
    var bandeauTexte = document.getElementById("bandeauTexte");
    bandeau.classList.remove("visible", "urgent");
    if (isAdmin) {
        badgeEl.textContent = "👑 Admin"; badgeEl.className = "status-badge badge-admin";
        document.body.classList.remove("mode-visiteur");
    } else if (isAbonne && dateFin) {
        var dj = new Date(); dj.setHours(0,0,0,0);
        var f = new Date(dateFin); f.setHours(0,0,0,0);
        var jr = Math.ceil((f - dj) / 86400000);
        if (jr <= 1) { badgeEl.textContent = "⚠️ Dernier jour"; badgeEl.className = "status-badge badge-warning"; bandeau.classList.add("visible", "urgent"); bandeauTexte.textContent = "🚨 Dernier jour d'abonnement !"; }
        else if (jr <= 3) { badgeEl.textContent = "⚠️ " + jr + "j"; badgeEl.className = "status-badge badge-warning"; bandeau.classList.add("visible"); bandeauTexte.textContent = "⚠️ Abonnement expire dans " + jr + " jour(s)."; }
        else { badgeEl.textContent = "⭐ " + jr + "j"; badgeEl.className = "status-badge badge-abonne"; }
        document.body.classList.remove("mode-visiteur");
    } else {
        badgeEl.textContent = "🚫 Gratuit"; badgeEl.className = "status-badge badge-gratuit";
        document.body.classList.add("mode-visiteur");
    }
    var db = document.getElementById('drawerBadge');
    if (db) { db.textContent = badgeEl.textContent; db.className = badgeEl.className; }
    var premium = ['cockpit', 'comparateur', 'labo', 'boules', 'verif', 'analyses'];
    premium.forEach(function(id) {
        var overlay = document.getElementById('overlay-' + id);
        var content = document.getElementById('content-' + id);
        var card = document.getElementById('lock-' + id);
        if (isAdmin || isAbonne) {
            if (overlay) overlay.style.display = "none";
            if (card) card.classList.remove('premium-locked');
            if (content) { content.removeAttribute('aria-hidden'); content.removeAttribute('inert'); }
        } else {
            if (overlay) overlay.style.display = "flex";
            if (card) card.classList.add('premium-locked');
            if (content) { content.setAttribute('aria-hidden','true'); content.setAttribute('inert',''); }
        }
    });
    var dash = document.getElementById('dashboardAdmin');
    if (dash) dash.style.display = isAdmin ? "block" : "none";
    rafraichirDonnees().then(function() {
        if (document.querySelectorAll('.plage-box').length === 0) { ajouterPlage(); ajouterPlage(); }
        actualiserCockpit();
        if (isAdmin) { actualiserDashboard(); chargerUtilisateursAuto(); }
        remplirBoulesGrid();
    });
}
function contacterAdmin() { window.open("https://wa.me/22900000000?text=Bonjour,%20je%20souhaite%20m'abonner.", "_blank"); }

async function chargerDepuisCloud() {
  var statusEl = document.getElementById("statusCloud");
  statusEl.textContent = "⏳ Téléchargement...";
  let tous = [], page = 0, parPage = 1000, enCours = true;
  while (enCours) {
    let { data, error } = await supabaseClient.from('tirages').select('*').order('date', { ascending: true }).order('heure', { ascending: true }).range(page * parPage, (page + 1) * parPage - 1);
    if (error) { statusEl.textContent = "❌ Erreur."; statusEl.style.color = "var(--color-hot)"; return []; }
    if (data.length > 0) { tous = tous.concat(data); page++; } else { enCours = false; }
  }
  statusEl.textContent = "✅ Connecté ! (" + tous.length + " tirages)";
  statusEl.style.color = "#27ae60";
  donneesCloud = tous.map(function(item) {
      var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
      return { id: item.id, date: item.date, jeu: item.jeu, heure: item.heure, boules: arr, somme: arr.reduce(function(a,b){return a+b;},0) };
  });
  return donneesCloud;
}
async function rafraichirDonnees() {
  if (modeDemoActif) { afficherSacSelectionne(); remplirBoulesGrid(); return; }
  await chargerDepuisCloud();
  afficherSacSelectionne();
  if (document.getElementById('onglet-cockpit').classList.contains('active')) actualiserCockpit();
  if (document.getElementById('onglet-labo').classList.contains('active')) { remplirSelecteurTirage(); remplirSelectMulti(); }
  if (document.getElementById('onglet-boules').classList.contains('active')) remplirBoulesGrid();
  if (estAdmin) { actualiserDashboard(); }
}
async function actualiserDashboard() {
    if (!estAdmin) return;
    var total = donneesCloud.length;
    document.getElementById('dashTotal').textContent = total.toLocaleString('fr-FR');
    document.getElementById('dashStar').textContent = donneesCloud.filter(function(t){return t.jeu==='Star';}).length.toLocaleString('fr-FR');
    document.getElementById('dashFortune').textContent = donneesCloud.filter(function(t){return t.jeu==='Fortune';}).length.toLocaleString('fr-FR');
    document.getElementById('dashDigital').textContent = donneesCloud.filter(function(t){return t.jeu==='Digital';}).length.toLocaleString('fr-FR');
    if (total > 0) {
        var dd = donneesCloud.reduce(function(max,t){return t.date>max?t.date:max;}, donneesCloud[0].date);
        document.getElementById('dashDerniereDate').textContent = new Date(dd).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
    } else { document.getElementById('dashDerniereDate').textContent = "—"; }
    try {
        var aujourdhui = new Date().toISOString().slice(0,10);
        const { data: profils } = await supabaseClient.from('profils').select('role, date_fin_abonnement');
        var nb = (profils || []).filter(function(p){ if(p.role==='admin') return true; if(!p.date_fin_abonnement) return false; return p.date_fin_abonnement >= aujourdhui; }).length;
        document.getElementById('dashAbonnes').textContent = nb.toLocaleString('fr-FR');
    } catch(e) { document.getElementById('dashAbonnes').textContent = "?"; }
}

async function chargerUtilisateursAuto() {
    if (!estAdmin) return;
    var tbody = document.getElementById("tbodyUtilisateurs");
    var table = document.getElementById("tableUtilisateurs");
    var msg = document.getElementById("msgUtilisateurs");
    if (!tbody || !table) return;
    tbody.innerHTML = "<tr><td colspan='4'>Chargement...</td></tr>";
    table.style.display = "table";
    try {
        const { data: profils, error } = await supabaseClient.from('profils').select('*').order('role', { ascending: true });
        if (error) throw error;
        if (!profils || profils.length === 0) {
            msg.style.color = "var(--color-star)";
            msg.textContent = "Aucun utilisateur trouvé.";
            return;
        }
        var html = "";
        profils.forEach(function(p) {
            var badgeClass = p.role === 'admin' ? 'badge-admin' : (p.role === 'abonne' ? 'badge-abonne' : 'badge-gratuit');
            var badgeTxt = p.role === 'admin' ? 'Admin' : (p.role === 'abonne' ? 'Abonné' : 'Visiteur');
            var dateInputVal = p.date_fin_abonnement ? p.date_fin_abonnement : '';
            var emailAffiche = p.email ? p.email : "ID: " + p.id.substring(0,8) + "...";
            
            html += "<tr>";
            html += "<td style='text-align:left;' data-label='Email'><b>" + emailAffiche + "</b></td>";
            html += "<td data-label='Rôle'><span class='status-badge " + badgeClass + "' style='margin:0;'>" + badgeTxt + "</span></td>";
            html += "<td data-label='Fin abonnement'><input type='date' value='" + dateInputVal + "' id='dateUser_" + p.id + "' style='padding:5px; font-size:12px;'></td>";
            html += "<td data-label='Action'>";
            html += "<select id='roleUser_" + p.id + "' style='padding:5px; font-size:12px;'>";
            html += "<option value='visiteur' " + (p.role === 'visiteur' ? 'selected' : '') + ">Visiteur</option>";
            html += "<option value='abonne' " + (p.role === 'abonne' ? 'selected' : '') + ">Abonné</option>";
            html += "<option value='admin' " + (p.role === 'admin' ? 'selected' : '') + ">Admin</option>";
            html += "</select> ";
            html += "<button onclick=\"sauvegarderPrivileges('" + p.id + "', event)\" style='padding:5px 10px; font-size:12px; min-height:auto; background:#27ae60;'>💾 Sauver</button>";
            html += "</td></tr>";
        });
        tbody.innerHTML = html;
        msg.style.color = "#27ae60";
        msg.textContent = "✅ " + profils.length + " utilisateur(s) chargé(s).";
    } catch (err) {
        msg.style.color = "var(--color-hot)";
        msg.textContent = "❌ Erreur : " + err.message;
    }
}

async function chargerUtilisateurs() {
    await chargerUtilisateursAuto();
}

async function sauvegarderPrivileges(userId, event) {
    if (!estAdmin) { alert("Action réservée aux administrateurs."); return; }
    var selectRole = document.getElementById("roleUser_" + userId);
    var inputDate = document.getElementById("dateUser_" + userId);
    var nouveauRole = selectRole.value;
    var nouvelleDate = inputDate.value || null;
    
    if (userId === (await supabaseClient.auth.getUser()).data.user.id && nouveauRole !== 'admin') {
        if (!confirm("⚠️ Attention, vous allez retirer votre propre statut d'administrateur. Confirmer ?")) return;
    }
    var btn = event.target;
    var oldText = btn.textContent;
    btn.textContent = "⏳...";
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.from('profils').update({
            role: nouveauRole,
            date_fin_abonnement: nouvelleDate
        }).eq('id', userId);
        if (error) throw error;
        btn.textContent = "✅ OK";
        btn.style.background = "#27ae60";
        setTimeout(function() { btn.textContent = oldText; btn.style.background = ""; btn.disabled = false; }, 2000);
        if (userId === (await supabaseClient.auth.getUser()).data.user.id) {
            verifierSession();
        }
    } catch (err) {
        alert("❌ Erreur : " + err.message);
        btn.textContent = oldText;
        btn.disabled = false;
    }
}

function changerOngletAnalyse(id, btn) {
    document.querySelectorAll('.ana-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.ana-content').forEach(function(c) { c.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('ana-' + id).classList.add('active');
}

function executerAnalyses() {
    var jeu = document.getElementById('anaJeu').value;
    var source = (modeDemoActif ? DONNEES_DEMO : donneesCloud).filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    if (source.length < 5) {
        document.getElementById('anaPairesTop10').innerHTML = "<li>Pas assez de données.</li>";
        return;
    }
    var paires = {}, trios = {};
    source.forEach(function(t) {
        var b = t.boules;
        for (var i = 0; i < b.length; i++) {
            for (var j = i + 1; j < b.length; j++) {
                var p = [b[i], b[j]].sort(function(a, c) { return a - c; }).join("-");
                paires[p] = (paires[p] || 0) + 1;
            }
        }
        for (var k = 0; k < b.length; k++) {
            for (var l = k + 1; l < b.length; l++) {
                for (var m = l + 1; m < b.length; m++) {
                    var tr = [b[k], b[l], b[m]].sort(function(a, c) { return a - c; }).join("-");
                    trios[tr] = (trios[tr] || 0) + 1;
                }
            }
        }
    });
    var topP = Object.keys(paires).map(function(k) { return { n: k, c: paires[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var topT = Object.keys(trios).map(function(k) { return { n: k, c: trios[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var htmlP = "";
    topP.forEach(function(p) { htmlP += "<li><b>" + p.n.replace("-", " + ") + "</b> <span class='status-badge badge-abonne'>" + p.c + " fois</span></li>"; });
    document.getElementById('anaPairesTop10').innerHTML = htmlP || "<li>Aucune paire.</li>";
    var htmlT = "";
    topT.forEach(function(p) { htmlT += "<li><b>" + p.n.replace(/-/g, " + ") + "</b> <span class='status-badge badge-warning'>" + p.c + " fois</span></li>"; });
    document.getElementById('anaTriosTop10').innerHTML = htmlT || "<li>Aucun trio.</li>";

    var positions = [[], [], [], [], []];
    source.forEach(function(t) {
        var triees = t.boules.slice().sort(function(a, b) { return a - b; });
        triees.forEach(function(b, idx) { if (idx < 5) positions[idx].push(b); });
    });
    var htmlPos = "";
    positions.forEach(function(pos, idx) {
        if (pos.length === 0) return;
        var somme = pos.reduce(function(a, b) { return a + b; }, 0);
        var moyenne = (somme / pos.length).toFixed(1);
        var min = Math.min.apply(null, pos);
        var max = Math.max.apply(null, pos);
        htmlPos += "<div class='ana-card'><h4>Position " + (idx + 1) + "</h4><ul class='ana-list'>";
        htmlPos += "<li>Moyenne <b>" + moyenne + "</b></li>";
        htmlPos += "<li>Minimum <b>" + min + "</b></li>";
        htmlPos += "<li>Maximum <b>" + max + "</b></li>";
        htmlPos += "</ul></div>";
    });
    document.getElementById('anaPositionsContainer').innerHTML = htmlPos;

    var jours = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    var parJour = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    source.forEach(function(t) {
        var d = new Date(t.date);
        if (!isNaN(d.getTime())) {
            var jourIdx = d.getDay();
            t.boules.forEach(function(b) { parJour[jourIdx].push(b); });
        }
    });
    var htmlJours = "";
    for (var j = 0; j < 7; j++) {
        var boulesDuJour = parJour[j];
        if (boulesDuJour.length === 0) continue;
        var freqJ = {};
        boulesDuJour.forEach(function(b) { freqJ[b] = (freqJ[b] || 0) + 1; });
        var top3 = Object.keys(freqJ).sort(function(a, b) { return freqJ[b] - freqJ[a]; }).slice(0, 3);
        htmlJours += "<div class='ana-card'><h4>" + jours[j] + " (" + (boulesDuJour.length / 5) + " tirages)</h4><ul class='ana-list'>";
        top3.forEach(function(n) { htmlJours += "<li>Boule <b>" + n + "</b> <span>sortie " + freqJ[n] + " fois</span></li>"; });
        htmlJours += "</ul></div>";
    }
    document.getElementById('anaJoursContainer').innerHTML = htmlJours;

    var heuresGroupees = {};
    source.forEach(function(t) {
        if (!heuresGroupees[t.heure]) heuresGroupees[t.heure] = [];
        t.boules.forEach(function(b) { heuresGroupees[t.heure].push(b); });
    });
    var htmlHeures = "";
    var heuresTriees = Object.keys(heuresGroupees).sort();
    heuresTriees.forEach(function(h) {
        var boulesH = heuresGroupees[h];
        var freqH = {};
        boulesH.forEach(function(b) { freqH[b] = (freqH[b] || 0) + 1; });
        var top3 = Object.keys(freqH).sort(function(a, b) { return freqH[b] - freqH[a]; }).slice(0, 3);
        htmlHeures += "<div class='ana-card'><h4>Créneau " + h + " (" + (boulesH.length / 5) + " tirages)</h4><ul class='ana-list'>";
        top3.forEach(function(n) { htmlHeures += "<li>Boule <b>" + n + "</b> <span>sortie " + freqH[n] + " fois</span></li>"; });
        htmlHeures += "</ul></div>";
    });
    document.getElementById('anaHeuresContainer').innerHTML = htmlHeures;
}

var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]');
  var panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) {
    var s = (t.id === 'tab-' + id);
    t.setAttribute('aria-selected', s ? 'true' : 'false');
    t.setAttribute('tabindex', s ? '0' : '-1');
    t.classList.toggle('active', s);
  });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  if (btn) btn.focus();
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'labo') { remplirSelecteurTirage(); remplirSelectMulti(); }
  if (id === 'boules') remplirBoulesGrid();
  if (id === 'demo') initialiserDemo();
  if (id === 'verif') { var d = document.getElementById('verifDate'); if (d && !d.value) d.value = new Date().toISOString().slice(0,10); }
  if (id === 'analyses') { setTimeout(executerAnalyses, 100); }
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }

document.addEventListener('DOMContentLoaded', function() {
  var tl = document.querySelector('[role="tablist"]');
  if (tl) {
    tl.addEventListener('keydown', function(e) {
      var tabs = Array.from(tl.querySelectorAll('[role="tab"]'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      var n = null;
      if (e.key === 'ArrowRight') n = tabs[(idx+1)%tabs.length];
      if (e.key === 'ArrowLeft') n = tabs[(idx-1+tabs.length)%tabs.length];
      if (e.key === 'Home') n = tabs[0];
      if (e.key === 'End') n = tabs[tabs.length-1];
      if (n) { e.preventDefault(); _ouvrirOnglet(n.id.replace('tab-',''), n); }
    });
  }
  initialiserBoutonMuet();
});

function getTiragesDuSac(sacId) {
    return donneesCloud.filter(function(t) {
        if (sacId === 'tous') return true;
        if (sacId === 'Star') return t.jeu === 'Star';
        if (sacId === 'Fortune') return t.jeu === 'Fortune';
        if (sacId === 'Digital') return t.jeu === 'Digital';
        if (sacId === 'Star_Digital') return t.jeu === 'Star' || t.jeu === 'Digital';
        if (sacId === 'Fortune_Digital') return t.jeu === 'Fortune' || t.jeu === 'Digital';
        if (sacId === 'Star_Fortune') return t.jeu === 'Star' || t.jeu === 'Fortune';
        if (sacId === 'Star_Fortune_Digital') return true;
        return false;
    });
}
function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value;
    var tf = getTiragesDuSac(sacId);
    var conteneur = document.getElementById("conteneurSac");
    conteneur.innerHTML = "";
    if (tf.length === 0) { conteneur.innerHTML = "<p style='color:var(--text-muted);'>Aucun tirage.</p>"; return; }
    var parDate = {};
    tf.forEach(function(t) { if (!parDate[t.date]) parDate[t.date] = []; parDate[t.date].push(t); });
    var dates = Object.keys(parDate).sort();
    function jeuxDuSac(id) {
        if (id === 'tous') return ['Star', 'Fortune', 'Digital'];
        if (id === 'Star') return ['Star'];
        if (id === 'Fortune') return ['Fortune'];
        if (id === 'Digital') return ['Digital'];
        if (id === 'Star_Digital') return ['Star', 'Digital'];
        if (id === 'Fortune_Digital') return ['Fortune', 'Digital'];
        if (id === 'Star_Fortune') return ['Star', 'Fortune'];
        if (id === 'Star_Fortune_Digital') return ['Star', 'Fortune', 'Digital'];
        return [];
    }
    var ja = jeuxDuSac(sacId), seul = (ja.length === 1);
    var html = "", n = 0;
    dates.forEach(function(ds) {
        var tj = parDate[ds], dObj = new Date(ds);
        if (isNaN(dObj.getTime())) return;
        var df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        var hSet = new Set();
        ja.forEach(function(j){ heuresPourJeu(j, dObj).forEach(function(h){ hSet.add(h); }); });
        if (hSet.size === 0) return;
        var hArr = Array.from(hSet).sort();
        var htmlJ = "<div class='day-card'><h3 class='day-header'>📅 " + df + "</h3>", ajout = 0;
        hArr.forEach(function(h) {
            var t = tj.find(function(x){ return x.heure === h; });
            if (!t && !seul) return;
            var jpH = null;
            ja.forEach(function(j){ if (heuresPourJeu(j, dObj).indexOf(h) !== -1 && !jpH) jpH = j; });
            n++; ajout++;
            htmlJ += "<div class='day-row'><div class='day-time'><span aria-hidden='true'>Ligne " + n + "</span><span class='sr-only'>Ligne " + n + "</span><br><small>" + h + "</small></div>";
            if (t) {
                var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
                htmlJ += "<div class='day-game'>" + t.jeu + "</div><div class='day-nums'>";
                t.boules.forEach(function(b){ htmlJ += "<span class='ball " + c + "' role='img' aria-label='Boule " + b + " " + t.jeu + "'>" + b + "</span>"; });
                htmlJ += "</div>";
            } else {
                htmlJ += "<div class='day-game' style='color:var(--border-color);'>" + (jpH||'-') + "</div><div class='day-nums'><span class='ball empty'>-</span></div>";
            }
            htmlJ += "</div>";
        });
        htmlJ += "</div>";
        if (ajout > 0) html += htmlJ;
    });
    conteneur.innerHTML = html || "<p style='color:var(--text-muted);'>Aucun tirage.</p>";
}

document.getElementById("btnAjouter").addEventListener("click", async function () {
  if (!estAdmin) { alert("Admin uniquement."); return; }
  var msg = document.getElementById("message"); msg.textContent = "Envoi..."; msg.style.color = "var(--primary)";
  var date = document.getElementById("date").value;
  var jeu = document.getElementById("jeuSaisie").value;
  var heure = document.getElementById("heureSaisie").value;
  var boules = [];
  for (var i = 1; i <= 5; i++) {
    var v = parseInt(document.getElementById("b" + i).value, 10);
    if (isNaN(v) || v < 1 || v > 90) { msg.style.color = "var(--color-hot)"; msg.textContent = "Boules 1-90."; return; }
    boules.push(v);
  }
  if (!date) { msg.style.color = "var(--color-hot)"; msg.textContent = "Date requise."; return; }
  if (new Set(boules).size !== 5) { msg.style.color = "var(--color-hot)"; msg.textContent = "Boules différentes."; return; }
  let { error } = await supabaseClient.from('tirages').insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }]);
  if (error) { msg.style.color = "var(--color-hot)"; msg.textContent = "❌ Erreur."; return; }
  for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = "";
  msg.style.color = "#27ae60"; msg.textContent = "✅ Sauvegardé !"; await rafraichirDonnees();
});

var timerSup = null, secSup = 5, modSup = false, focSup = null;
async function toutEffacer() {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    var nb = donneesCloud.length;
    if (nb === 0) { alert("Aucune donnée."); return; }
    focSup = document.activeElement; modSup = true;
    document.getElementById("modalSuppression").style.display = "flex";
    document.getElementById("modalSuppCompteur").textContent = nb.toLocaleString('fr-FR') + " tirage" + (nb>1?"s":"");
    document.getElementById("champConfirmation").value = "";
    document.getElementById("modalSuppMessage").textContent = "";
    var ch = document.getElementById("champConfirmation");
    ch.addEventListener("input", verifierMot);
    ch.addEventListener("keydown", function(e){ if(e.key==="Enter" && !document.getElementById("btnConfirmerFinal").disabled) confirmerSuppressionFinale(); });
    ch.focus();
    secSup = 5;
    document.getElementById("btnConfirmerFinal").disabled = true;
    document.getElementById("btnConfirmerFinal").innerHTML = '🗑️ Supprimer définitivement (<span id="compteARebours">5</span>s)';
    if (timerSup) clearInterval(timerSup);
    timerSup = setInterval(function() {
        secSup--;
        var el = document.getElementById("compteARebours");
        if (el) el.textContent = Math.max(0, secSup);
        if (secSup <= 0) { clearInterval(timerSup); timerSup = null; verifierMot(); }
    }, 1000);
    document.addEventListener("keydown", piegeSup);
}
function verifierMot() {
    var ch = document.getElementById("champConfirmation"), btn = document.getElementById("btnConfirmerFinal");
    var ok = ch.value.trim().toUpperCase() === "SUPPRIMER";
    var delai = secSup <= 0;
    if (ok && delai) { btn.disabled = false; btn.innerHTML = '🗑️ Supprimer définitivement'; }
    else {
        btn.disabled = true;
        var t = "🗑️ Supprimer définitivement";
        if (!delai) t += " (" + Math.max(0, secSup) + "s)";
        else if (!ok) t += " (mot incorrect)";
        btn.innerHTML = t;
    }
}
function piegeSup(e) {
    if (!modSup) return;
    if (e.key === "Escape") { e.preventDefault(); fermerModaleSuppression(); return; }
    if (e.key !== "Tab") return;
    var m = document.getElementById("modalSuppression");
    var f = m.querySelectorAll('button:not([disabled]), input, summary, [tabindex]:not([tabindex="-1"])');
    if (f.length === 0) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function fermerModaleSuppression() {
    modSup = false;
    document.getElementById("modalSuppression").style.display = "none";
    if (timerSup) { clearInterval(timerSup); timerSup = null; }
    document.removeEventListener("keydown", piegeSup);
    if (focSup && focSup.focus) focSup.focus();
}
async function confirmerSuppressionFinale() {
    var msg = document.getElementById("modalSuppMessage");
    msg.style.color = "var(--color-hot)"; msg.textContent = "⏳ Suppression...";
    document.getElementById("btnConfirmerFinal").disabled = true;
    const { error } = await supabaseClient.from('tirages').delete().neq('id', 0);
    if (error) { msg.textContent = "❌ " + error.message; return; }
    msg.style.color = "#27ae60"; msg.textContent = "✅ Supprimé.";
    await rafraichirDonnees();
    setTimeout(function(){ fermerModaleSuppression(); }, 1500);
}
function exporterCSV() {
    if (donneesCloud.length === 0) { alert("Rien."); return; }
    var l = ["date,heure,jeu,boules"];
    donneesCloud.forEach(function(t){ l.push([t.date,t.heure,t.jeu,'"'+t.boules.join(",")+'"'].join(",")); });
    var blob = new Blob([l.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url;
    a.download = "loto-benin-" + new Date().toISOString().slice(0,10) + ".csv";
    a.click(); URL.revokeObjectURL(url);
}
function exporterSauvegardeComplete() {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    if (donneesCloud.length === 0) { alert("Aucune donnée."); return; }
    exporterCSV();
}

var importAttente = null;
function parseDateExotique(ligne) {
    var moisMap = { 'janv':1,'jan':1,'janvier':1,'fevr':2,'fev':2,'fevrier':2,'févr':2,'fév':2,'février':2,'mars':3,'mar':3,'avr':4,'avril':4,'mai':5,'juin':6,'juil':7,'juillet':7,'aout':8,'août':8,'sept':9,'septembre':9,'oct':10,'octobre':10,'nov':11,'novembre':11,'dec':12,'déc':12,'decembre':12,'décembre':12 };
    var m;
    m = ligne.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return { jour: parseInt(m[3],10), mois: parseInt(m[2],10), annee: parseInt(m[1],10) };
    m = ligne.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
    if (m) { var a = m[3].length===2 ? parseInt("20"+m[3],10) : parseInt(m[3],10); return { jour: parseInt(m[1],10), mois: parseInt(m[2],10), annee: a }; }
    m = ligne.match(/(\d{1,2})(?:er)?\s+([a-zéèûôàç]+)\.?\s+(\d{2,4})/i);
    if (m) { var mt = m[2].toLowerCase().replace(/[^a-zéèûôàç]/g,''); var mn = moisMap[mt]; if (mn) { var a2 = m[3].length===2 ? parseInt("20"+m[3],10) : parseInt(m[3],10); return { jour: parseInt(m[1],10), mois: mn, annee: a2 }; } }
    return null;
}
async function traiterTexteColle() {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    var txt = document.getElementById("texteAImporter").value;
    var msg = document.getElementById("importMessage");
    if (!txt.trim()) { msg.style.color = "var(--color-hot)"; msg.textContent = "❌ Vide."; return; }
    msg.style.color = "var(--primary)"; msg.textContent = "⏳ Analyse...";
    var lignes = txt.split(/\r?\n/), nv = [], cf = [], inv = 0;
    var aA = new Date().getFullYear(), aMax = aA+1, aMin = 2004;
    lignes.forEach(function(l) {
        if (!l.trim()) return;
        var ll = l.toLowerCase();
        if (ll.indexOf("date")!==-1 || ll.indexOf("column")!==-1 || ll.indexOf("benin")!==-1) return;
        var d = parseDateExotique(l);
        if (!d) { inv++; return; }
        if (d.jour<1||d.jour>31||d.mois<1||d.mois>12||d.annee<aMin||d.annee>aMax) { inv++; return; }
        var df = d.annee + "-" + String(d.mois).padStart(2,'0') + "-" + String(d.jour).padStart(2,'0');
        var jt = "Star", ht = "14H";
        if (ll.indexOf("digital")!==-1) jt = "Digital";
        else if (ll.indexOf("fortune")!==-1) jt = "Fortune";
        else if (/\b(jeu|ven|lun|mar)\b/i.test(l)) jt = "Fortune";
        var mh = l.match(/(\d{1,2})\s*[hH]/);
        if (mh) ht = mh[1].padStart(2,'0') + "H";
        var tn = l.replace(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/, ' ').replace(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, ' ').replace(/\d{1,2}(?:er)?\s+[a-zéèûôàç]+\.?\s+\d{2,4}/i, ' ').replace(/star|fortune|digital|\b(jeu|ven|lun|mar|mer|sam|dom)\b/gi, ' ').replace(/N[°o]\s*\d+/i, ' ');
        var ns = [], mn2 = tn.match(/\b\d{1,2}\b/g);
        if (mn2) for (var i=0;i<mn2.length;i++){ var num = parseInt(mn2[i],10); if (num>=1&&num<=90) ns.push(num); }
        var b = ns.slice(0,5); if (b.length<5) b = ns.slice(-5);
        if (b.length===5 && new Set(b).size===5) {
            var no = { date: df, heure: ht, jeu: jt, boules: JSON.stringify(b), numero_tirage: "Auto", _b: b };
            var ii = nv.findIndex(function(t){ return t.date===no.date && t.heure===no.heure && t.jeu===no.jeu; });
            if (ii !== -1) { nv[ii] = no; return; }
            var ic = cf.findIndex(function(c){ return c.nouveau.date===no.date && c.nouveau.heure===no.heure && c.nouveau.jeu===no.jeu; });
            if (ic !== -1) { cf[ic].nouveau = no; return; }
            var ex = donneesCloud.find(function(t){ return t.date===no.date && t.heure===no.heure && t.jeu===no.jeu; });
            if (ex) cf.push({ existant: { id: ex.id, date: ex.date, heure: ex.heure, jeu: ex.jeu, boules: ex.boules }, nouveau: no });
            else nv.push(no);
        } else { inv++; }
    });
    if (nv.length === 0 && cf.length === 0) { msg.style.color = "var(--color-star)"; msg.textContent = "⚠️ Aucun valide (" + inv + " invalides)."; return; }
    importAttente = { nouveaux: nv, conflits: cf, invalides: inv };
    document.getElementById("statNouveaux").textContent = nv.length;
    document.getElementById("statConflits").textContent = cf.length;
    document.getElementById("statInvalides").textContent = inv;
    document.getElementById("nbConflitsQuestion").textContent = cf.length;
    var ll2 = document.getElementById("listeConflits");
    if (cf.length === 0) ll2.innerHTML = "<p style='color:var(--text-muted);'>Aucun conflit.</p>";
    else {
        var h = "";
        cf.slice(0,10).forEach(function(c){ h += "<div class='ligne-conflit'>⚠️ <b>" + c.nouveau.date + "</b> · " + c.nouveau.jeu + " · " + c.nouveau.heure + "<br>Ancien : <span class='ancien'>[" + c.existant.boules.join(", ") + "]</span><br>Nouveau : <span class='nouveau'>[" + c.nouveau._b.join(", ") + "]</span></div>"; });
        ll2.innerHTML = h;
    }
    document.getElementById("btnEcraser").style.display = cf.length > 0 ? "inline-block" : "none";
    document.getElementById("modalConflitImport").style.display = "flex";
    document.getElementById("messageConflit").textContent = "";
    document.querySelectorAll("#modalConflitImport button").forEach(function(b){ b.disabled = false; });
    msg.style.color = "var(--text-muted)"; msg.textContent = "En attente de votre choix.";
}
async function executerImport(mode) {
    if (!importAttente) return;
    var msg = document.getElementById("messageConflit"), mp = document.getElementById("importMessage");
    msg.style.color = "var(--primary)"; msg.textContent = "⏳...";
    document.querySelectorAll("#modalConflitImport button").forEach(function(b){ b.disabled = true; });
    var nv = importAttente.nouveaux, cf = importAttente.conflits, nbA = 0, nbE = 0, nbI = 0, err = null;
    if (mode === 'ecraser' && cf.length > 0) {
        var tb = 20;
        for (var i=0;i<cf.length;i+=tb) {
            var batch = cf.slice(i,i+tb);
            var ps = batch.map(function(c){ return supabaseClient.from('tirages').update({ boules: c.nouveau.boules }).eq('id', c.existant.id); });
            var rs = await Promise.all(ps);
            for (var r=0;r<rs.length;r++) if (rs[r].error) { err = rs[r].error; break; }
            if (err) break;
            nbE += batch.length;
        }
    } else { nbI = cf.length; }
    if (!err && nv.length > 0) {
        var tp = 100, ai = nv.map(function(t){ return { date: t.date, heure: t.heure, jeu: t.jeu, boules: t.boules, numero_tirage: t.numero_tirage }; });
        for (var j=0;j<ai.length;j+=tp) {
            var paq = ai.slice(j,j+tp);
            var res = await supabaseClient.from('tirages').insert(paq);
            if (res.error) { err = res.error; break; }
            nbA += paq.length;
        }
    }
    if (err) { msg.style.color = "var(--color-hot)"; msg.textContent = "❌ " + err.message; document.querySelectorAll("#modalConflitImport button").forEach(function(b){ b.disabled = false; }); return; }
    var res2 = "✅ Terminé. " + nbA + " ajouté(s)" + (mode==='ecraser' ? ", " + nbE + " écrasé(s)" : ", " + nbI + " ignoré(s)") + ".";
    msg.style.color = "#27ae60"; msg.textContent = res2;
    mp.style.color = "#27ae60"; mp.textContent = res2;
    importAttente = null;
    document.getElementById("texteAImporter").value = "";
    setTimeout(function(){ document.getElementById("modalConflitImport").style.display = "none"; rafraichirDonnees(); }, 1500);
}
function annulerImport() {
    importAttente = null;
    document.getElementById("modalConflitImport").style.display = "none";
    document.getElementById("importMessage").style.color = "var(--color-star)";
    document.getElementById("importMessage").textContent = "⏹️ Annulé.";
}

var timerP = null, secP = 5, modP = false, focP = null;
function ouvrirModaleSuppressionPeriode() {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    focP = document.activeElement; modP = true;
    var a = new Date(), dm = new Date(a.getFullYear(), a.getMonth(), 1);
    document.getElementById("periodeDebut").value = dm.toISOString().slice(0,10);
    document.getElementById("periodeFin").value = a.toISOString().slice(0,10);
    document.getElementById("periodeJeu").value = "tous";
    document.getElementById("champConfirmationPeriode").value = "";
    document.getElementById("messagePeriode").textContent = "";
    document.getElementById("modalSuppressionPeriode").style.display = "flex";
    previsualiserPeriode();
    document.getElementById("periodeDebut").focus();
    secP = 5;
    var btn = document.getElementById("btnConfirmerPeriode");
    btn.disabled = true;
    btn.innerHTML = '🗑️ Supprimer la période (<span id="compteAReboursPeriode">5</span>s)';
    if (timerP) clearInterval(timerP);
    timerP = setInterval(function() {
        secP--;
        var el = document.getElementById("compteAReboursPeriode");
        if (el) el.textContent = Math.max(0, secP);
        if (secP <= 0) { clearInterval(timerP); timerP = null; verifierMotPeriode(); }
    }, 1000);
    document.addEventListener("keydown", piegePeriode);
}
function fermerModaleSuppressionPeriode() {
    modP = false;
    document.getElementById("modalSuppressionPeriode").style.display = "none";
    if (timerP) { clearInterval(timerP); timerP = null; }
    document.removeEventListener("keydown", piegePeriode);
    if (focP && focP.focus) focP.focus();
}
function piegePeriode(e) {
    if (!modP) return;
    if (e.key === "Escape") { e.preventDefault(); fermerModaleSuppressionPeriode(); return; }
    if (e.key !== "Tab") return;
    var m = document.getElementById("modalSuppressionPeriode");
    var f = m.querySelectorAll('button:not([disabled]), input, select, summary, [tabindex]:not([tabindex="-1"])');
    if (f.length === 0) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function appliquerRaccourciPeriode(t) {
    var a = new Date(), d, f;
    if (t === 'ceMois') { d = new Date(a.getFullYear(), a.getMonth(), 1); f = a; }
    else if (t === 'moisDernier') { d = new Date(a.getFullYear(), a.getMonth()-1, 1); f = new Date(a.getFullYear(), a.getMonth(), 0); }
    else if (t === 'cetteAnnee') { d = new Date(a.getFullYear(), 0, 1); f = a; }
    else if (t === 'anneeDerniere') { d = new Date(a.getFullYear()-1, 0, 1); f = new Date(a.getFullYear()-1, 11, 31); }
    if (d && f) { document.getElementById("periodeDebut").value = d.toISOString().slice(0,10); document.getElementById("periodeFin").value = f.toISOString().slice(0,10); previsualiserPeriode(); }
}
function tiragesDansPeriode() {
    var d = document.getElementById("periodeDebut").value, f = document.getElementById("periodeFin").value, j = document.getElementById("periodeJeu").value;
    if (!d || !f) return [];
    return donneesCloud.filter(function(t){ if (t.date < d || t.date > f) return false; if (j !== 'tous' && t.jeu !== j) return false; return true; });
}
function previsualiserPeriode() {
    var l = tiragesDansPeriode(), el = document.getElementById("apercuPeriode"), tot = donneesCloud.length;
    var pc = tot > 0 ? Math.round(l.length / tot * 100) : 0, av = "";
    if (tot > 0 && l.length === tot) { av = " — ⚠️ TOUTE la base !"; el.classList.add('alerte'); }
    else if (pc >= 80) { av = " — ⚠️ " + pc + "% de la base."; el.classList.add('alerte'); }
    else el.classList.remove('alerte');
    el.innerHTML = "<span class='compteur'>" + l.length + "</span> tirage(s) supprimés sur " + tot + av + ".";
    verifierMotPeriode();
}
function verifierMotPeriode() {
    var ch = document.getElementById("champConfirmationPeriode"), btn = document.getElementById("btnConfirmerPeriode");
    if (!ch || !btn) return;
    var ok = ch.value.trim().toUpperCase() === "SUPPRIMER", delai = secP <= 0, l = tiragesDansPeriode(), nb = l.length > 0;
    if (ok && delai && nb) { btn.disabled = false; btn.innerHTML = '🗑️ Supprimer ' + l.length + ' tirage(s)'; }
    else {
        btn.disabled = true;
        var t = "🗑️ Supprimer la période";
        if (!delai) t += " (" + Math.max(0, secP) + "s)";
        else if (!ok) t += " (mot incorrect)";
        else if (!nb) t += " (aucun)";
        btn.innerHTML = t;
    }
}
async function confirmerSuppressionPeriode() {
    var msg = document.getElementById("messagePeriode");
    var d = document.getElementById("periodeDebut").value, f = document.getElementById("periodeFin").value, j = document.getElementById("periodeJeu").value, l = tiragesDansPeriode();
    if (l.length === 0) { msg.textContent = "Aucun."; return; }
    msg.style.color = "var(--color-hot)"; msg.textContent = "⏳ Suppression de " + l.length + "...";
    document.getElementById("btnConfirmerPeriode").disabled = true;
    let q = supabaseClient.from('tirages').delete().gte('date', d).lte('date', f);
    if (j !== 'tous') q = q.eq('jeu', j);
    const { error } = await q;
    if (error) { msg.textContent = "❌ " + error.message; document.getElementById("btnConfirmerPeriode").disabled = false; return; }
    msg.style.color = "#27ae60"; msg.textContent = "✅ " + l.length + " supprimé(s).";
    await rafraichirDonnees();
    setTimeout(fermerModaleSuppressionPeriode, 1500);
}
function exporterCSVPeriode() {
    var l = tiragesDansPeriode();
    if (l.length === 0) { alert("Aucun."); return; }
    var lg = ["date,heure,jeu,boules"];
    l.forEach(function(t){ lg.push([t.date,t.heure,t.jeu,'"'+t.boules.join(",")+'"'].join(",")); });
    var b = new Blob([lg.join("\n")], { type: "text/csv;charset=utf-8;" });
    var u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = "loto-periode-" + document.getElementById("periodeDebut").value + "_" + document.getElementById("periodeFin").value + ".csv";
    a.click(); URL.revokeObjectURL(u);
}

var nPlages = 0;
function ajouterPlage() {
    if (nPlages >= 5) { alert("Max 5."); return; }
    nPlages++;
    var d = document.createElement("div"); d.className = "plage-box"; d.id = "plage-container-" + nPlages;
    var cols = ["#2980b9","#d35400","#c0392b","#27ae60","#8e44ad"], c = cols[(nPlages-1)%5];
    d.style.borderTop = "4px solid " + c;
    d.innerHTML = `<label for="sacNum${nPlages}" style="color:${c};">Plage ${nPlages}</label>
        <select id="sacNum${nPlages}">
            <option value="tous">Tous</option><option value="Star">Star</option><option value="Fortune">Fortune</option><option value="Digital">Digital</option>
            <option value="Star_Digital">Star + Digital</option><option value="Fortune_Digital">Fortune + Digital</option><option value="Star_Fortune">Star + Fortune</option><option value="Star_Fortune_Digital">Tous</option>
        </select>
        <div style="display:flex; gap:5px;">
            <input type="number" id="refNum${nPlages}" placeholder="Ligne N°" style="width:80px;">
            <select id="refRange${nPlages}" style="flex:1;"><option value="10">10</option><option value="20">20</option><option value="30" selected>30</option><option value="40">40</option></select>
        </div>
        <button class="danger" style="font-size:12px; padding:5px;" onclick="supprimerPlage(${nPlages})">Retirer</button>`;
    document.getElementById("plages-config").appendChild(d);
}
function supprimerPlage(id) { var d = document.getElementById("plage-container-" + id); if (d) { d.remove(); nPlages--; } }
function executerComparateurMulti() {
    var plages = [];
    for (var i=1;i<=nPlages;i++) {
        var c = document.getElementById("plage-container-" + i); if (!c) continue;
        var s = document.getElementById("sacNum" + i).value;
        var rl = parseInt(document.getElementById("refNum" + i).value, 10);
        var rg = parseInt(document.getElementById("refRange" + i).value, 10);
        if (isNaN(rl)) continue;
        var td = getTiragesDuSac(s), si = rl - 1;
        if (si < 0 || si >= td.length) { alert("Ligne " + rl + " n'existe pas."); return; }
        var p = [], mn = Math.max(0, si-rg), mx = Math.min(td.length-1, si+rg);
        for (var j=mn;j<=mx;j++) p.push({ data: td[j], ligneLocale: j+1 });
        plages.push({ id: i, nomSac: document.getElementById("sacNum" + i).options[document.getElementById("sacNum" + i).selectedIndex].text, data: p, color: ["#2980b9","#d35400","#c0392b","#27ae60","#8e44ad"][(i-1)%5] });
    }
    if (plages.length < 2) { alert("Il faut 2 plages."); return; }
    var ml = 0; plages.forEach(function(p){ if (p.data.length > ml) ml = p.data.length; });
    var html = "", stats = plages.map(function(p){ return { nom: p.id, exact: 0, miroir: 0 }; });
    plages.forEach(function(p, pIdx) {
        html += "<div class='comp-col' style='border-top: 4px solid " + p.color + ";'><h3 style='text-align:center; color:" + p.color + ";'>" + p.nomSac + "</h3><table class='comp-table'><thead><tr><th>Ligne</th><th>Numéros</th></tr></thead><tbody>";
        for (var l=0;l<ml;l++) {
            var it = p.data[l];
            if (!it) { html += "<tr><td><i>-</i></td><td>-</td></tr>"; continue; }
            var t = it.data;
            html += "<tr><td><b>L." + it.ligneLocale + "</b><br><small>" + t.jeu + " " + t.heure + "</small></td><td>";
            t.boules.forEach(function(n) {
                var me = 0, mt = 0, am = true;
                plages.forEach(function(o) {
                    if (o.id === p.id) return;
                    var oi = o.data[l];
                    if (oi) {
                        var ot = oi.data;
                        if (ot.boules.indexOf(n) !== -1) me++;
                        else if (ot.boules.indexOf(getTurning(n)) !== -1) mt++;
                        else am = false;
                    } else am = false;
                });
                var cls = "comp-ball", si = "";
                if (am) {
                    if (me === plages.length - 1) { cls += " match-exact"; si = "identique"; stats[pIdx].exact++; }
                    else if (mt === plages.length - 1) { cls += " match-turning"; si = "miroir"; stats[pIdx].miroir++; }
                    else { cls += " match-multi"; si = "commun"; }
                }
                html += "<button type='button' class='" + cls + "' onclick='colorierBoule(this)' aria-label='Boule " + n + (si?", "+si:"") + "'>" + n + "</button>";
            });
            html += "</td></tr>";
        }
        html += "</tbody></table></div>";
    });
    document.getElementById("resultatComparaison").innerHTML = html;
    derniereComparaison = plages;
    annoncerResumeComparaison(plages, stats);
}
function getTurning(n) { var s = n.toString().padStart(2,'0'); var i = parseInt(s.split('').reverse().join(''), 10); return (i === 0 || i > 90) ? n : i; }
function resetColors() { document.querySelectorAll('.comp-ball').forEach(function(b){ b.style.backgroundColor = ''; b.style.color = ''; b.style.borderColor = ''; b.style.boxShadow = ''; }); }
function changerCouleur(el, c) { document.querySelectorAll('.color-btn').forEach(function(b){ b.setAttribute('aria-pressed','false'); }); el.setAttribute('aria-pressed','true'); couleurActive = c === 'annuler' ? 'annuler' : c; }
function colorierBoule(b) {
    if (couleurActive === 'annuler') { b.style.backgroundColor = ''; b.style.color = ''; b.style.borderColor = ''; b.style.boxShadow = ''; }
    else { b.style.backgroundColor = couleurActive; b.style.color = '#fff'; b.style.borderColor = '#333'; b.style.boxShadow = '0 0 8px ' + couleurActive; b.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)'; }
}

function actualiserCockpit() {
    var jeu = document.getElementById("cockpitJeu").value, h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });
    if (f.length === 0) { document.getElementById("cockpitPrediction").innerHTML = "<p style='color:var(--text-muted);'>Pas de données.</p>"; document.getElementById("cockpitCycles").innerHTML = "<p style='color:var(--text-muted);'>Pas de données.</p>"; return; }
    var freq = {}, ec = {}; for (var n=1;n<=90;n++) { freq[n]=0; ec[n]=0; }
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    var ns = Object.keys(freq).map(function(k){ return { n: parseInt(k,10), f: freq[k], e: ec[k] }; });
    var tc = ns.slice().sort(function(a,b){ return b.f-a.f; }).slice(0,5);
    var tr = ns.slice().sort(function(a,b){ return b.e-a.e; }).slice(0,5);
    var hp = "<p><b>🔥 Chauds :</b><br>"; tc.forEach(function(x){ hp += "<span class='ball hot'>" + x.n + "</span> (" + x.f + "x) "; });
    hp += "</p><p style='margin-top:15px;'><b>❄️ Retards :</b><br>"; tr.forEach(function(x){ hp += "<span class='ball cold'>" + x.n + "</span> (R:" + x.e + ") "; });
    hp += "</p>";
    document.getElementById("cockpitPrediction").innerHTML = hp;
    var hc = "<ul class='stat-list'>"; tr.forEach(function(x){ hc += "<li><b>" + x.n + "</b> Retard: " + x.e + "</li>"; }); hc += "</ul>";
    document.getElementById("cockpitCycles").innerHTML = hc;
}
function genererGrilleCockpit() {
    var jeu = document.getElementById("cockpitJeu").value, h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });
    if (f.length < 10) { document.getElementById("grilleGeneree").textContent = "Pas assez de données."; return; }
    var freq = {}; for (var n=1;n<=90;n++) freq[n]=0;
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var tc = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; }).slice(0,3).map(Number);
    var ec = {}; for (var n2=1;n2<=90;n2++) ec[n2]=0;
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    var tr = Object.keys(ec).sort(function(a,b){ return ec[b]-ec[a]; }).slice(0,2).map(Number);
    var cb = tc.concat(tr); cb = [...new Set(cb)];
    while(cb.length < 5) { var r = Math.floor(Math.random()*90)+1; if(cb.indexOf(r)===-1) cb.push(r); }
    cb.sort(function(a,b){ return a-b; });
    document.getElementById("grilleGeneree").innerHTML = "🎲 " + cb.join(" - ");
}

var tirageLabo = null;
function faireTheosophie() {
    if (!tirageLabo) return;
    var st = 0, cd = [];
    tirageLabo.boules.forEach(function(n) {
        var s = n.toString(), sn = 0, dn = [];
        for (var i=0;i<s.length;i++) { var c = parseInt(s[i],10); sn += c; dn.push(c); }
        st += sn; cd.push(dn.join("+") + "=" + sn);
    });
    var ta = st, rt = "";
    while (ta > 90) { ta -= 90; rt += " -> " + ta; }
    document.getElementById("resultatOperations").innerHTML = "<b>Théosophie :</b><br>" + cd.join(" | ") + "<br><b>Total : " + st + "</b><br>" + (rt ? "Réduction : " + rt + "<br>" : "") + "Résultat : <span class='ball'>" + ta + "</span>";
}
function remplirSelecteurTirage() {
    var s1 = document.getElementById("selectTirageLabo"); s1.innerHTML = "";
    if (donneesCloud.length === 0) { s1.innerHTML = "<option>Aucun</option>"; return; }
    donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " | " + t.jeu + " " + t.heure + " : [" + t.boules.join(", ") + "]"; s1.appendChild(o); });
    analyserTirageLabo();
}
function remplirSelectMulti() {
    var s2 = document.getElementById("selectMultiTirages"); s2.innerHTML = "";
    if (donneesCloud.length === 0) { s2.innerHTML = "<option>Aucun</option>"; return; }
    donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " | " + t.jeu + " " + t.heure + " : [" + t.boules.join(", ") + "]"; s2.appendChild(o); });
}
function analyserTirageLabo() {
    var i = document.getElementById("selectTirageLabo").value;
    if (i !== "" && donneesCloud[i]) { tirageLabo = donneesCloud[i]; document.getElementById("resultatOperations").innerHTML = "Tirage : " + tirageLabo.boules.join(" - "); }
}
function faireTurning() {
    if (!tirageLabo) return;
    var r = tirageLabo.boules.map(function(n){ var s = n.toString(); if (s.length===1) s = "0"+s; var i = parseInt(s.split('').reverse().join(''),10); return (i>90||i===0)?n:i; });
    document.getElementById("resultatOperations").innerHTML = "<b>Miroir :</b><br>Base : " + tirageLabo.boules.join(" - ") + "<br>Miroir : <span style='color:#9b59b6; font-weight:bold;'>" + r.join(" - ") + "</span>";
}
function faireAddition() {
    if (!tirageLabo) return;
    var s = tirageLabo.boules.reduce(function(a,b){ return a+b; },0), r = s;
    while (r > 90) r -= 90;
    document.getElementById("resultatOperations").innerHTML = "<b>Somme :</b><br>" + tirageLabo.boules.join(" + ") + " = " + s + "<br>Réduit : <strong>" + r + "</strong>";
}
function executerAdditions() {
    var sel = document.getElementById("selectMultiTirages");
    var idx = Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value,10); });
    if (idx.length === 0) { document.getElementById("resultatLaboAvance").textContent = "Sélectionnez des tirages."; return; }
    var html = "<b>Additions :</b><br>";
    idx.forEach(function(i){ var t = donneesCloud[i]; var s = t.boules.reduce(function(a,b){ return a+b; },0); var r = s; while(r > 90) r -= 90; html += t.date + " " + t.heure + " : " + s + " → " + r + "<br>"; });
    document.getElementById("resultatLaboAvance").innerHTML = html;
}
function executerBankersMulti() {
    var sel = document.getElementById("selectMultiTirages");
    var idx = Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value,10); });
    if (idx.length < 2) { document.getElementById("resultatLaboAvance").textContent = "Sélectionnez 2+ tirages."; return; }
    var communs = donneesCloud[idx[0]].boules.slice();
    for (var i=1;i<idx.length;i++) communs = communs.filter(function(n){ return donneesCloud[idx[i]].boules.indexOf(n) !== -1; });
    var html = "<b>Communs (" + idx.length + " tirages) :</b><br>";
    if (communs.length === 0) html += "Aucun numéro commun.";
    else html += communs.map(function(n){ return "<span class='ball'>" + n + "</span>"; }).join(" ");
    document.getElementById("resultatLaboAvance").innerHTML = html;
}

function remplirBoulesGrid() {
    var grid = document.getElementById('boulesGrid'); if (!grid) return;
    var src = modeDemoActif ? DONNEES_DEMO : donneesCloud;
    var freq = {}; for (var n=1;n<=90;n++) freq[n]=0;
    src.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var maxF = Math.max.apply(null, Object.values(freq).concat([1]));
    var html = "";
    for (var n2=1;n2<=90;n2++) {
        var c = "boule-selecteur";
        if (freq[n2] === maxF && maxF > 0) c += " chaud";
        else if (freq[n2] === 0 && src.length > 0) c += " froid";
        html += "<button type='button' class='" + c + "' data-boule='" + n2 + "' onclick='afficherDetailBoule(" + n2 + ")'>" + n2 + "</button>";
    }
    grid.innerHTML = html;
}
function afficherDetailBoule(num) {
    var src = modeDemoActif ? DONNEES_DEMO : donneesCloud;
    if (src.length === 0) { document.getElementById('bouleDetail').style.display = 'none'; return; }
    document.querySelectorAll('.boule-selecteur').forEach(function(b){ b.classList.toggle('active', parseInt(b.dataset.boule,10) === num); });
    var appar = src.filter(function(t){ return t.boules.indexOf(num) !== -1; });
    var freq = appar.length;
    var dernier = appar.length > 0 ? appar[appar.length-1] : null;
    var ecart = 0;
    if (dernier) { ecart = src.length - 1 - src.indexOf(dernier); } else { ecart = src.length; }
    var paires = {};
    appar.forEach(function(t){ t.boules.forEach(function(a){ if (a===num) return; paires[a] = (paires[a]||0)+1; }); });
    var topP = Object.keys(paires).map(function(k){ return { n: parseInt(k,10), c: paires[k] }; }).sort(function(a,b){ return b.c-a.c; }).slice(0,8);
    var derniers = appar.slice(-20).reverse();
    var h = "<h3>🔍 Boule " + num + "</h3><div class='boule-stats-grid'>";
    h += "<div class='boule-stat'><span class='num'>" + freq + "</span><span class='label'>Sorties</span></div>";
    h += "<div class='boule-stat'><span class='num'>" + ecart + "</span><span class='label'>Écart</span></div>";
    h += "<div class='boule-stat'><span class='num'>" + (dernier ? dernier.date : '—') + "</span><span class='label'>Dernier</span></div>";
    h += "<div class='boule-stat'><span class='num'>" + (src.length>0 ? Math.round(freq/src.length*1000)/10 : 0) + "%</span><span class='label'>Fréquence</span></div></div>";
    if (topP.length > 0) {
        h += "<p><b>🔗 Paires favorites :</b></p><div class='paires-list'>";
        topP.forEach(function(p){ h += "<span class='paire-tag'>" + p.n + " <span class='count'>×" + p.c + "</span></span>"; });
        h += "</div>";
    }
    if (derniers.length > 0) {
        h += "<p style='margin-top:20px;'><b>📜 20 dernières apparitions :</b></p>";
        derniers.forEach(function(t) {
            h += "<div class='boule-historique-ligne'><span class='date'>" + t.date + "</span><span class='jeu'>" + t.jeu + "</span><span class='heure'>" + t.heure + "</span><span class='boules'>";
            t.boules.forEach(function(b){ h += "<span class='boule-mini" + (b===num?" cible":"") + "'>" + b + "</span>"; });
            h += "</span></div>";
        });
    } else {
        h += "<p style='color:var(--text-muted); margin-top:15px;'>Jamais sortie dans les données.</p>";
    }
    var d = document.getElementById('bouleDetail');
    d.innerHTML = h; d.style.display = 'block';
}

function verifierGrille() {
    var jeu = document.getElementById('verifJeu').value;
    var date = document.getElementById('verifDate').value;
    var heure = document.getElementById('verifHeure').value;
    var mise = parseInt(document.getElementById('verifMise').value, 10) || 100;
    var src = modeDemoActif ? DONNEES_DEMO : donneesCloud;
    var bj = [];
    for (var i=1;i<=5;i++) {
        var v = parseInt(document.getElementById('vB' + i).value, 10);
        if (isNaN(v) || v < 1 || v > 90) { alert("5 boules 1-90."); return; }
        bj.push(v);
    }
    if (new Set(bj).size !== 5) { alert("Boules différentes."); return; }
    if (!date) { alert("Date requise."); return; }
    var t = src.find(function(x){ return x.date === date && x.heure === heure && x.jeu === jeu; });
    var el = document.getElementById('verifResultat');
    if (!t) { el.innerHTML = "<div class='verif-resultat perdu'>Aucun tirage pour " + date + " " + heure + " " + jeu + ".</div>"; return; }
    var bons = bj.filter(function(n){ return t.boules.indexOf(n) !== -1; }).length;
    var gain = bons > 0 ? GRILLE_GAINS_LNB[bons].gainPour100 * (mise / 100) : 0;
    if (bons > 0) {
        el.innerHTML = "<div class='verif-resultat gagne'>🎉 <b>" + bons + "</b> bon(s) numéro(s) sur 5 !<br><span class='rang'>Rang " + bons + "</span>Tirage : " + t.boules.join(" - ") + "<br>Votre grille : " + bj.join(" - ") + "<br><span class='gain'>💰 Gain estimé : " + gain.toLocaleString('fr-FR') + " FCFA</span><span style='font-size:11px; display:block; margin-top:8px;'>Mise " + mise + " FCFA · ×" + GRILLE_GAINS_LNB[bons].multiplicateur + "</span></div>";
    } else {
        el.innerHTML = "<div class='verif-resultat perdu'>😔 Aucun bon numéro.<br>Tirage : " + t.boules.join(" - ") + "<br>Votre grille : " + bj.join(" - ") + "</div>";
    }
}

function initialiserDemo() {
    var grid = document.getElementById('demoGrid'); if (!grid) return;
    var demos = [
        { titre: '🚀 Cockpit', desc: "Découvrez les numéros chauds/froids et le générateur sur données fictives.", action: 'demoCockpit()' },
        { titre: '⚖️ Comparateur', desc: "Comparez deux plages de tirages fictifs et voyez les identiques/miroirs.", action: 'demoComparateur()' },
        { titre: '🧪 Laboratoire', desc: "Analysez un tirage fictif : miroir, somme, théosophie.", action: 'demoLabo()' },
        { titre: '🔍 Boules', desc: "Explorez l'historique de la boule 12 sur les données de démo.", action: 'demoBoules()' },
        { titre: '✅ Vérifier', desc: "Testez la vérification d'une grille gagnante sur un tirage fictif.", action: 'demoVerif()' },
        { titre: '📥 Import', desc: "Découvrez le principe de la modale de conflit (démo).", action: 'demoImport()' }
    ];
    var h = "";
    demos.forEach(function(d){ h += "<div class='demo-card'><span class='demo-badge'>Démo</span><h4>" + d.titre + "</h4><p>" + d.desc + "</p><button onclick='" + d.action + "'>▶ Lancer</button></div>"; });
    grid.innerHTML = h;
}
function activerDemo() {
    modeDemoActif = true;
    donneesCloud = DONNEES_DEMO.map(function(t,i){ return { id: 'demo-'+i, date: t.date, jeu: t.jeu, heure: t.heure, boules: t.boules, somme: t.boules.reduce(function(a,b){return a+b;},0) }; });
    actualiserCockpit(); remplirSelecteurTirage(); remplirSelectMulti(); remplirBoulesGrid(); afficherSacSelectionne();
}
function quitterDemo() {
    modeDemoActif = false;
    rafraichirDonnees().then(function() {
        remplirBoulesGrid();
        document.getElementById('bouleDetail').style.display = 'none';
        document.getElementById('verifResultat').innerHTML = '';
    });
}
function demoCockpit() { activerDemo(); _ouvrirOnglet('cockpit', document.getElementById('tab-cockpit')); setTimeout(actualiserCockpit, 100); }
function demoComparateur() {
    activerDemo(); _ouvrirOnglet('comparateur', document.getElementById('tab-comparateur'));
    setTimeout(function() {
        if (document.querySelectorAll('.plage-box').length === 0) { ajouterPlage(); ajouterPlage(); }
        var r1 = document.getElementById('refNum1'); if (r1) r1.value = 5;
        var r2 = document.getElementById('refNum2'); if (r2) r2.value = 5;
        executerComparateurMulti();
    }, 200);
}
function demoLabo() {
    activerDemo(); _ouvrirOnglet('labo', document.getElementById('tab-labo'));
    setTimeout(function() { remplirSelecteurTirage(); var s = document.getElementById('selectTirageLabo'); if (s && s.options.length > 0) { s.value = 0; analyserTirageLabo(); faireTurning(); } }, 200);
}
function demoBoules() { activerDemo(); _ouvrirOnglet('boules', document.getElementById('tab-boules')); setTimeout(function() { remplirBoulesGrid(); afficherDetailBoule(12); }, 200); }
function demoVerif() {
    activerDemo(); _ouvrirOnglet('verif', document.getElementById('tab-verif'));
    setTimeout(function() {
        document.getElementById('verifJeu').value = 'Star';
        document.getElementById('verifDate').value = '2025-01-08';
        document.getElementById('verifHeure').value = '14H';
        document.getElementById('vB1').value = 12;
        document.getElementById('vB2').value = 27;
        document.getElementById('vB3').value = 45;
        document.getElementById('vB4').value = 10;
        document.getElementById('vB5').value = 20;
        verifierGrille();
    }, 200);
}
function demoImport() { alert("La démo d'import montre le principe de la modale de conflit. En mode réel, collez vos données dans l'onglet Compilation (admin). Aucune donnée n'a été modifiée."); }

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("date").valueAsDate = new Date();
    verifierSession();
});
