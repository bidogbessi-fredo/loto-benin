const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var estAdmin = false;
var estAbonne = false;

// Variables Ateliers et Chercheur
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var dernieresBoulesCherchees = [];
var tiragesComparateur = [];
var tirageActifHistorique = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); });
}

// --- GESTION DU DRAWER (MENU LATÉRAL) ---
function ouvrirDrawer() {
    document.getElementById('drawerMenu').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('btnBurger').setAttribute('aria-expanded', 'true');
}
function fermerDrawer() {
    document.getElementById('drawerMenu').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
    document.getElementById('btnBurger').setAttribute('aria-expanded', 'false');
}
function seDeconnecterDepuisDrawer() { fermerDrawer(); seDeconnecter(); }

// --- GESTION DES ATELIERS (BARRE LATÉRALE) ---
function majBarreAteliers() {
    var bar = document.getElementById('ateliersBar');
    var topOnglets = ['saisie', 'cockpit', 'analyses']; // Onglets fixes
    var ateliersFiltres = ateliersOuverts.filter(function(id) { return topOnglets.indexOf(id) === -1; });
    
    if (ateliersFiltres.length === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    bar.innerHTML = "";
    
    ateliersFiltres.forEach(function(id) {
        var icone = "🔧";
        var btnOnglet = document.getElementById('tab-' + id);
        if(btnOnglet) { icone = btnOnglet.textContent.trim().split(' ')[0]; }
        
        var btn = document.createElement('button');
        btn.className = "atelier-btn" + (document.getElementById('onglet-' + id).classList.contains('active') ? " active" : "");
        btn.innerHTML = icone + "<span class='atelier-close' onclick='retirerAtelier(event, \"" + id + "\")'>✕</span>";
        btn.onclick = function() { _ouvrirOnglet(id, document.getElementById('tab-' + id)); };
        bar.appendChild(btn);
    });
}
function ajouterAtelier(id) {
    var topOnglets = ['saisie', 'cockpit', 'analyses'];
    if (topOnglets.indexOf(id) !== -1) return; 
    if (ateliersOuverts.indexOf(id) === -1) {
        ateliersOuverts.push(id);
        localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts));
    }
    majBarreAteliers();
}
function retirerAtelier(e, id) {
    e.stopPropagation();
    ateliersOuverts = ateliersOuverts.filter(function(a) { return a !== id; });
    localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts));
    majBarreAteliers();
    if(document.getElementById('onglet-' + id).classList.contains('active')) {
        _ouvrirOnglet('saisie', document.getElementById('tab-saisie'));
    }
}

// --- NAVIGATION ONGLETS ---
var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]');
  var panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) {
    var s = (t.id === 'tab-' + id);
    t.setAttribute('aria-selected', s ? 'true' : 'false');
    t.classList.toggle('active', s);
  });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  
  // Ajouter l'onglet ouvert à la barre des ateliers (sauf s'il est déjà en haut)
  ajouterAtelier(id);
  majBarreAteliers();
  
  if (btn) btn.focus();
  if (id === 'recherche') initialiserRecherche();
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); _ouvrirOnglet(id, document.getElementById('tab-' + id)); }


// --- AUTHENTIFICATION ---
async function verifierSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profil } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
        let role = profil ? profil.role : 'visiteur';
        let dateFin = null, dateValide = false;
        if (profil && profil.date_fin_abonnement) { dateFin = new Date(profil.date_fin_abonnement); dateValide = !isNaN(dateFin.getTime()); }
        estAdmin = (role === 'admin');
        estAbonne = (role === 'admin') || (dateValide && dateFin > new Date());
        afficherApplication(estAdmin, estAbonne, dateValide ? dateFin : null);
    } else {
        document.getElementById("login-screen").style.display = "flex";
        document.getElementById("app-content").style.display = "none";
    }
}

async function seConnecter() {
    var email = document.getElementById("loginEmail").value, password = document.getElementById("loginPassword").value, msg = document.getElementById("loginMessage");
    msg.textContent = "Connexion...";
    const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) { msg.textContent = "❌ " + error.message; } 
    else { msg.textContent = "✅ Connecté !"; setTimeout(() => { verifierSession(); }, 500); }
}

function entrerVisiteur() { estAdmin = false; estAbonne = false; afficherApplication(false, false, null); }

async function seDeconnecter() {
    await supabaseClient.auth.signOut();
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app-content").style.display = "none";
    afficherConnexion();
}

function afficherApplication(isAdmin, isAbonne, dateFin) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    var badgeEl = document.getElementById("statusBadge");
    if (isAdmin) { badgeEl.textContent = "👑 Admin"; badgeEl.className = "status-badge badge-admin"; document.body.classList.remove("mode-visiteur"); }
    else if (isAbonne) { badgeEl.textContent = "⭐ Abonné"; badgeEl.className = "status-badge badge-abonne"; document.body.classList.remove("mode-visiteur"); }
    else { badgeEl.textContent = "🚫 Gratuit"; badgeEl.className = "status-badge badge-gratuit"; document.body.classList.add("mode-visiteur"); }
    
    var dash = document.getElementById('dashboardAdmin');
    if (dash) dash.style.display = isAdmin ? "block" : "none";
    
    chargerDonnees();
    if (isAdmin) chargerUtilisateursAuto();
}

// --- DONNÉES ---
async function chargerDonnees() {
  var statusEl = document.getElementById("statusCloud"); statusEl.textContent = "⏳...";
  let tous = [], page = 0, enCours = true;
  while (enCours) {
    let { data } = await supabaseClient.from('tirages').select('*').order('date', { ascending: true }).order('heure', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
    if (data && data.length > 0) { tous = tous.concat(data); page++; } else { enCours = false; }
  }
  statusEl.textContent = "✅ Connecté ! (" + tous.length + " tirages)";
  donneesCloud = tous.map(function(item) {
      var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
      return { id: item.id, date: item.date, jeu: item.jeu, heure: item.heure, boules: arr };
  });
  afficherSacSelectionne();
  if (estAdmin) actualiserDashboard();
}

// --- AJOUT TIRAGE ---
document.getElementById("btnAjouter")?.addEventListener("click", async function () {
  if (!estAdmin) { alert("Admin uniquement."); return; }
  var msg = document.getElementById("message"); msg.textContent = "Envoi..."; msg.style.color = "blue";
  var date = document.getElementById("date").value, jeu = document.getElementById("jeuSaisie").value, heure = document.getElementById("heureSaisie").value, boules = [];
  for (var i = 1; i <= 5; i++) { var v = parseInt(document.getElementById("b" + i).value, 10); if (isNaN(v)) { msg.textContent = "Erreur boules"; return; } boules.push(v); }
  
  let { error } = await supabaseClient.from('tirages').insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }]);
  if (error) { msg.textContent = "❌ Erreur."; msg.style.color = "red"; } 
  else { 
      msg.textContent = "✅ Tirage enregistré !"; msg.style.color = "green"; 
      for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = "";
      document.getElementById("filtrePeriode").value = "tout";
      chargerDonnees(); 
  }
});

// --- TABLEAU DE BORD UTILISATEURS ---
async function chargerUtilisateursAuto() {
    var tbody = document.getElementById("tbodyUtilisateurs"), table = document.getElementById("tableUtilisateurs");
    if (!tbody) return; table.style.display = "table"; tbody.innerHTML = "<tr><td colspan='4'>Chargement...</td></tr>";
    const { data: profils } = await supabaseClient.from('profils').select('*').order('role');
    var html = "";
    if(profils) profils.forEach(function(p) {
        var dateVal = p.date_fin_abonnement ? p.date_fin_abonnement.split('T')[0] : '';
        html += "<tr><td>" + (p.email || 'Inconnu') + "</td><td>" + p.role + "</td><td><input type='date' value='" + dateVal + "' id='dateUser_" + p.id + "'></td>";
        html += "<td><select id='roleUser_" + p.id + "'><option value='visiteur' "+(p.role==='visiteur'?'selected':'')+">Visiteur</option><option value='abonne' "+(p.role==='abonne'?'selected':'')+">Abonné</option><option value='admin' "+(p.role==='admin'?'selected':'')+">Admin</option></select>";
        html += " <button onclick=\"sauvegarderPrivileges('" + p.id + "')\" style='background:green;'>💾</button></td></tr>";
    });
    tbody.innerHTML = html;
}

async function sauvegarderPrivileges(userId) {
    var role = document.getElementById("roleUser_" + userId).value;
    var dateFin = document.getElementById("dateUser_" + userId).value || null;
    const { error } = await supabaseClient.from('profils').update({ role: role, date_fin_abonnement: dateFin }).eq('id', userId);
    if(error) alert("Erreur: " + error.message); else alert("✅ Utilisateur mis à jour !");
}

async function actualiserDashboard() {
    var total = donneesCloud.length;
    document.getElementById('dashTotal').textContent = total;
    document.getElementById('dashStar').textContent = donneesCloud.filter(function(t){return t.jeu==='Star';}).length;
    document.getElementById('dashFortune').textContent = donneesCloud.filter(function(t){return t.jeu==='Fortune';}).length;
    document.getElementById('dashDigital').textContent = donneesCloud.filter(function(t){return t.jeu==='Digital';}).length;
}

// --- AFFICHAGE COMPILATION ---
function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value;
    var filtre = document.getElementById("filtrePeriode") ? document.getElementById("filtrePeriode").value : "tout";
    var tf = donneesCloud;
    
    if (filtre === 'recent') {
        var strAuj = new Date().toISOString().slice(0,10), strHier = new Date(Date.now()-86400000).toISOString().slice(0,10);
        tf = tf.filter(function(t) { return t.date === strAuj || t.date === strHier; });
    } else if (filtre === 'mois') {
        var prefixMois = new Date().toISOString().slice(0,7);
        tf = tf.filter(function(t) { return t.date.startsWith(prefixMois); });
    }

    var conteneur = document.getElementById("conteneurSac"); conteneur.innerHTML = "";
    if (tf.length === 0) { conteneur.innerHTML = "<p>Aucun tirage.</p>"; return; }
    
    var parDate = {}; tf.forEach(function(t) { if (!parDate[t.date]) parDate[t.date] = []; parDate[t.date].push(t); });
    var html = "";
    Object.keys(parDate).sort().forEach(function(dateStr) {
        html += "<div class='day-card'><h3 class='day-header'>📅 " + dateStr + "</h3>";
        parDate[dateStr].forEach(function(t) {
            var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
            html += "<div class='day-row'><div class='day-time'>" + t.heure + "</div>";
            html += "<div class='day-game'>" + t.jeu + "</div><div class='day-nums'>";
            t.boules.forEach(function(b){ html += "<span class='ball " + c + "'>" + b + "</span>"; });
            html += "</div></div>";
        });
        html += "</div>";
    });
    conteneur.innerHTML = html;
}

// --- CHERCHEUR AVEC SOMME ---
function initialiserRecherche() {
    var container = document.getElementById('rechBoulesContainer'); if (!container || container.children.length > 0) return;
    container.innerHTML = '';
    ajouterChampRecherche(); ajouterChampRecherche();
}
function ajouterChampRecherche() {
    var container = document.getElementById('rechBoulesContainer'); if (container.children.length >= 5) return;
    var div = document.createElement('div'); div.className = 'rech-input-group';
    div.innerHTML = `<input type="number" class="rech-num" min="1" max="90" placeholder="N°" style="width:60px;">`;
    container.appendChild(div);
}
function retirerChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length > 1) c.lastElementChild.remove(); }
function changerModeRecherche() {
    var mode = document.getElementById('rechMode').value;
    document.getElementById('sectionRechBoules').style.display = mode === 'boules' ? 'block' : 'none';
    document.getElementById('sectionRechSomme').style.display = mode === 'somme' ? 'block' : 'none';
    document.getElementById('resultatRecherche').style.display = 'none';
}

function executerRecherche() {
    var mode = document.getElementById('rechMode').value, jeu = document.getElementById('rechJeu').value;
    var source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    var resultats = []; dernieresBoulesCherchees = [];

    if (mode === 'boules') {
        var nums = [];
        document.querySelectorAll('.rech-num').forEach(function(inp) {
            var v = parseInt(inp.value, 10); if (!isNaN(v)) { nums.push(v); dernieresBoulesCherchees.push(v); }
        });
        if (nums.length === 0) { alert("Entrez au moins une boule."); return; }
        
        source.forEach(function(t) {
            var match = true;
            for (var i = 0; i < nums.length; i++) { if (t.boules.indexOf(nums[i]) === -1) { match = false; break; } }
            if (match) resultats.push(t);
        });
    } else if (mode === 'somme') {
        var totalCible = parseInt(document.getElementById('rechTotalSomme').value, 10);
        var nbBoules = parseInt(document.getElementById('rechNbBoules').value, 10);
        if (isNaN(totalCible)) { alert("Entrez un total."); return; }
        
        source.forEach(function(t) {
            var combinaisons = obtenirCombinaisons(t.boules, nbBoules), match = false;
            for (var j = 0; j < combinaisons.length; j++) {
                if (combinaisons[j].reduce(function(a,b){return a+b;}, 0) === totalCible) { match = true; break; }
            }
            if (match) { resultats.push(t); t.boules.forEach(function(b) { if(dernieresBoulesCherchees.indexOf(b) === -1) dernieresBoulesCherchees.push(b); }); }
        });
    }
    afficherResultatsRecherche(resultats);
}

function obtenirCombinaisons(arr, k) {
    var res = [];
    function combiner(debut, actuels) {
        if (actuels.length === k) { res.push(actuels.slice()); return; }
        for (var i = debut; i < arr.length; i++) { actuels.push(arr[i]); combiner(i + 1, actuels); actuels.pop(); }
    }
    combiner(0, []); return res;
}

function afficherResultatsRecherche(resultats) {
    var box = document.getElementById('resultatRecherche'); box.style.display = 'block';
    document.getElementById('rechCompteur').textContent = resultats.length;
    var tbody = document.getElementById('tbodyResultatsRecherche'); tbody.innerHTML = "";
    if (resultats.length === 0) { tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Aucun résultat.</td></tr>"; return; }
    
    resultats.forEach(function(t) {
        var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
        var idxGlobal = donneesCloud.indexOf(t) + 1;
        var tr = document.createElement('tr');
        var html = "<td><b>L." + idxGlobal + "</b></td><td>" + t.date + " " + t.heure + "</td><td>" + t.jeu + "</td><td class='boules-cell'>";
        t.boules.forEach(function(b) { var isCible = dernieresBoulesCherchees.indexOf(b) !== -1; html += "<span class='ball " + c + "' style='" + (isCible ? "border: 2px solid #fff;" : "") + "'>" + b + "</span>"; });
        html += "</td><td>" + t.boules.reduce(function(a,b){return a+b;}, 0) + "</td>";
        tr.innerHTML = html; tbody.appendChild(tr);
    });
}

// --- UTILITAIRES ---
function afficherConnexion() { document.getElementById("form-inscription").style.display = "none"; document.getElementById("form-connexion").style.display = "block"; }
function afficherInscription() { document.getElementById("form-connexion").style.display = "none"; document.getElementById("form-inscription").style.display = "block"; }

document.addEventListener('DOMContentLoaded', function() {
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
    verifierSession();
});
