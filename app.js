const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var estAdmin = false;
var estAbonne = false;
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var tiragesComparateur = [];
var tirageActifHistorique = null;

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); }); }

// --- MENU LATÉRAL (DRAWER) ---
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

// --- BARRE DES ATELIERS ---
function majBarreAteliers() {
    var bar = document.getElementById('ateliersBar');
    var topOnglets = ['saisie', 'cockpit', 'analyses'];
    var ateliersFiltres = ateliersOuverts.filter(function(id) { return topOnglets.indexOf(id) === -1; });
    if (ateliersFiltres.length === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex"; bar.innerHTML = "";
    ateliersFiltres.forEach(function(id) {
        var icone = "🔧", btnOnglet = document.getElementById('tab-' + id);
        if(btnOnglet) icone = btnOnglet.textContent.trim().split(' ')[0];
        var btn = document.createElement('button');
        btn.className = "atelier-btn" + (document.getElementById('onglet-' + id).classList.contains('active') ? " active" : "");
        btn.innerHTML = icone + "<span class='atelier-close' onclick='retirerAtelier(event, \"" + id + "\")'>✕</span>";
        btn.onclick = function() { _ouvrirOnglet(id, btnOnglet); };
        bar.appendChild(btn);
    });
}
function ajouterAtelier(id) {
    var topOnglets = ['saisie', 'cockpit', 'analyses'];
    if (topOnglets.indexOf(id) !== -1) return; 
    if (ateliersOuverts.indexOf(id) === -1) { ateliersOuverts.push(id); localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts)); }
    majBarreAteliers();
}
function retirerAtelier(e, id) {
    e.stopPropagation();
    ateliersOuverts = ateliersOuverts.filter(function(a) { return a !== id; });
    localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts));
    majBarreAteliers();
    if(document.getElementById('onglet-' + id).classList.contains('active')) _ouvrirOnglet('saisie', document.getElementById('tab-saisie'));
}

// --- NAVIGATION ---
var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]'), panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) { var s = (t.id === 'tab-' + id); t.setAttribute('aria-selected', s ? 'true' : 'false'); t.classList.toggle('active', s); });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  ajouterAtelier(id); majBarreAteliers();
  if (btn) btn.focus();
  
  if (id === 'cockpit') actualiserCockpit(); // <-- LA LIGNE QUI MANQUAIT
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') { remplirSelecteursLabo(); }
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); _ouvrirOnglet(id, document.getElementById('tab-' + id)); }

// --- AUTHENTIFICATION ---
async function verifierSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profil } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
        let role = profil ? profil.role : 'visiteur', dateFin = null, dateValide = false;
        if (profil && profil.date_fin_abonnement) { dateFin = new Date(profil.date_fin_abonnement); dateValide = !isNaN(dateFin.getTime()); }
        estAdmin = (role === 'admin');
        estAbonne = (role === 'admin') || (dateValide && dateFin > new Date());
        afficherApplication(estAdmin, estAbonne, dateValide ? dateFin : null);
    } else {
        document.getElementById("login-screen").style.display = "flex"; document.getElementById("app-content").style.display = "none";
    }
}
async function seConnecter() {
    var email = document.getElementById("loginEmail").value, password = document.getElementById("loginPassword").value, msg = document.getElementById("loginMessage");
    msg.textContent = "Connexion...";
    const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) { msg.textContent = "❌ " + error.message; } else { msg.textContent = "✅ Connecté !"; setTimeout(() => { verifierSession(); }, 500); }
}
function entrerVisiteur() { estAdmin = false; estAbonne = false; afficherApplication(false, false, null); }
async function seDeconnecter() { await supabaseClient.auth.signOut(); document.getElementById("login-screen").style.display = "flex"; document.getElementById("app-content").style.display = "none"; afficherConnexion(); }

function afficherApplication(isAdmin, isAbonne, dateFin) {
    document.getElementById("login-screen").style.display = "none"; document.getElementById("app-content").style.display = "block";
    var badgeEl = document.getElementById("statusBadge");
    if (isAdmin) { badgeEl.textContent = "👑 Admin"; badgeEl.className = "status-badge badge-admin"; document.body.classList.remove("mode-visiteur"); }
    else if (isAbonne) { badgeEl.textContent = "⭐ Abonné"; badgeEl.className = "status-badge badge-abonne"; document.body.classList.remove("mode-visiteur"); }
    else { badgeEl.textContent = "🚫 Gratuit"; badgeEl.className = "status-badge badge-gratuit"; document.body.classList.add("mode-visiteur"); }
    var dash = document.getElementById('dashboardAdmin'); if (dash) dash.style.display = isAdmin ? "block" : "none";
    chargerDonnees(); if (isAdmin) chargerUtilisateursAuto();
}

// --- DONNÉES & COMPILATION ---
async function chargerDonnees() {
  var statusEl = document.getElementById("statusCloud"); statusEl.textContent = "⏳...";
  let tous = [], page = 0, enCours = true;
  while (enCours) {
    let { data } = await supabaseClient.from('tirages').select('*').order('date', { ascending: true }).order('heure', { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
    if (data && data.length > 0) { tous = tous.concat(data); page++; } else { enCours = false; }
  }
  statusEl.textContent = "✅ Connecté ! (" + tous.length + " tirages)";
  donneesCloud = tous.map(function(item) { var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules; return { id: item.id, date: item.date, jeu: item.jeu, heure: item.heure, boules: arr, somme: arr.reduce(function(a,b){return a+b;},0) }; });
  afficherSacSelectionne(); if (estAdmin) actualiserDashboard();
}

function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value, filtre = document.getElementById("filtrePeriode") ? document.getElementById("filtrePeriode").value : "tout", tf = donneesCloud;
    if (filtre === 'recent') { var a = new Date().toISOString().slice(0,10), h = new Date(Date.now()-86400000).toISOString().slice(0,10); tf = tf.filter(function(t) { return t.date === a || t.date === h; }); }
    else if (filtre === 'mois') { var p = new Date().toISOString().slice(0,7); tf = tf.filter(function(t) { return t.date.startsWith(p); }); }
    var conteneur = document.getElementById("conteneurSac"); conteneur.innerHTML = "";
    if (tf.length === 0) { conteneur.innerHTML = "<p>Aucun tirage.</p>"; return; }
    var parDate = {}; tf.forEach(function(t) { if (!parDate[t.date]) parDate[t.date] = []; parDate[t.date].push(t); });
    var html = "";
    Object.keys(parDate).sort().forEach(function(dateStr) {
        html += "<div class='day-card'><h3 class='day-header'>📅 " + dateStr + "</h3>";
        parDate[dateStr].forEach(function(t) {
            var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
            html += "<div class='day-row'><div class='day-time'>" + t.heure + "</div><div class='day-game'>" + t.jeu + "</div><div class='day-nums'>";
            t.boules.forEach(function(b){ html += "<span class='ball " + c + "'>" + b + "</span>"; });
            html += "</div></div>";
        });
        html += "</div>";
    });
    conteneur.innerHTML = html;
}

document.getElementById("btnAjouter")?.addEventListener("click", async function () {
  if (!estAdmin) { alert("Admin uniquement."); return; }
  var msg = document.getElementById("message"); msg.textContent = "Envoi..."; msg.style.color = "blue";
  var date = document.getElementById("date").value, jeu = document.getElementById("jeuSaisie").value, heure = document.getElementById("heureSaisie").value, boules = [];
  for (var i = 1; i <= 5; i++) { var v = parseInt(document.getElementById("b" + i).value, 10); if (isNaN(v)) { msg.textContent = "Erreur boules"; return; } boules.push(v); }
  let { error } = await supabaseClient.from('tirages').insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }]);
  if (error) { msg.textContent = "❌ Erreur."; msg.style.color = "red"; } 
  else { msg.textContent = "✅ Tirage enregistré !"; msg.style.color = "green"; for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = ""; document.getElementById("filtrePeriode").value = "tout"; chargerDonnees(); }
});

// --- COCKPIT (FONCTIONNEL) ---
function actualiserCockpit() {
    var jeu = document.getElementById("cockpitJeu").value, h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });
    if (f.length === 0) { document.getElementById("cockpitPrediction").innerHTML = "<p>Pas de données.</p>"; document.getElementById("cockpitCycles").innerHTML = "<p>Pas de données.</p>"; return; }
    
    var freq = {}, ec = {}; for (var n=1;n<=90;n++) { freq[n]=0; ec[n]=0; }
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); }); 
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    
    var ns = Object.keys(freq).map(function(k){ return { n: parseInt(k,10), f: freq[k], e: ec[k] }; });
    var tc = ns.slice().sort(function(a,b){ return b.f-a.f; }).slice(0,5);
    var tr = ns.slice().sort(function(a,b){ return b.e-a.e; }).slice(0,5);
    
    var hp = "<p><b>🔥 Chauds :</b><br>"; tc.forEach(function(x){ hp += "<span class='ball hot' style='background:#e74c3c'>" + x.n + "</span> (" + x.f + "x) "; });
    hp += "</p><p style='margin-top:15px;'><b>❄️ Retards :</b><br>"; tr.forEach(function(x){ hp += "<span class='ball cold' style='background:#3498db'>" + x.n + "</span> (R:" + x.e + ") "; });
    hp += "</p>";
    document.getElementById("cockpitPrediction").innerHTML = hp;
    
    var hc = "<ul style='list-style:none; padding:0;'>"; tr.forEach(function(x){ hc += "<li style='padding:5px 0; border-bottom:1px dashed #ccc;'><b>" + x.n + "</b> Retard: " + x.e + "</li>"; }); hc += "</ul>"; 
    document.getElementById("cockpitCycles").innerHTML = hc;
}

function genererGrilleCockpit() {
    var jeu = document.getElementById("cockpitJeu").value, h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });
    if (f.length < 10) { document.getElementById("grilleGeneree").textContent = "Pas assez de données."; return; }
    var freq = {}; for (var n=1;n<=90;n++) freq[n]=0; f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var tc = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; }).slice(0,3).map(Number);
    var ec = {}; for (var n2=1;n2<=90;n2++) ec[n2]=0; f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    var tr = Object.keys(ec).sort(function(a,b){ return ec[b]-ec[a]; }).slice(0,2).map(Number);
    var cb = tc.concat(tr); cb = [...new Set(cb)]; while(cb.length < 5) { var r = Math.floor(Math.random()*90)+1; if(cb.indexOf(r)===-1) cb.push(r); }
    cb.sort(function(a,b){ return a-b; }); document.getElementById("grilleGeneree").innerHTML = "🎲 " + cb.join(" - ");
}

// --- ANALYSES ---
function executerAnalyses() {
    var jeu = document.getElementById('anaJeu').value, source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    if (source.length < 5) { document.getElementById('anaPairesTop10').innerHTML = "<li>Pas assez de données.</li>"; return; }
    var paires = {};
    source.forEach(function(t) { var b = t.boules; for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) { var p = [b[i], b[j]].sort(function(a, c) { return a - c; }).join("-"); paires[p] = (paires[p] || 0) + 1; } });
    var topP = Object.keys(paires).map(function(k) { return { n: k, c: paires[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var htmlP = ""; topP.forEach(function(p) { htmlP += "<li><b>" + p.n.replace("-", " + ") + "</b> <span class='status-badge badge-abonne'>" + p.c + " fois</span></li>"; }); 
    document.getElementById('anaPairesTop10').innerHTML = htmlP || "<li>Aucune.</li>";
    document.getElementById('anaPositionsContainer').innerHTML = "";
    document.getElementById('anaJoursContainer').innerHTML = "";
    document.getElementById('anaHeuresContainer').innerHTML = "";
}

// --- CHERCHEUR ---
function initialiserRecherche() { var c = document.getElementById('rechBoulesContainer'); if (!c || c.children.length > 0) return; c.innerHTML = ''; ajouterChampRecherche(); ajouterChampRecherche(); }
function ajouterChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length >= 5) return; var div = document.createElement('div'); div.className = 'rech-input-group'; div.innerHTML = `<input type="number" class="rech-num" min="1" max="90" placeholder="N°" style="width:60px;">`; c.appendChild(div); }
function retirerChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length > 1) c.lastElementChild.remove(); }
function changerModeRecherche() { var m = document.getElementById('rechMode').value; document.getElementById('sectionRechBoules').style.display = m === 'boules' ? 'block' : 'none'; document.getElementById('sectionRechSomme').style.display = m === 'somme' ? 'block' : 'none'; document.getElementById('resultatRecherche').style.display = 'none'; }
function obtenirCombinaisons(arr, k) { var res = []; function combiner(debut, actuels) { if (actuels.length === k) { res.push(actuels.slice()); return; } for (var i = debut; i < arr.length; i++) { actuels.push(arr[i]); combiner(i + 1, actuels); actuels.pop(); } } combiner(0, []); return res; }
function executerRecherche() {
    var mode = document.getElementById('rechMode').value, jeu = document.getElementById('rechJeu').value, source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; }), resultats = [];
    if (mode === 'boules') {
        var nums = []; document.querySelectorAll('.rech-num').forEach(function(inp) { var v = parseInt(inp.value, 10); if (!isNaN(v)) nums.push(v); });
        if (nums.length === 0) { alert("Entrez au moins une boule."); return; }
        source.forEach(function(t) { var match = true; for (var i = 0; i < nums.length; i++) { if (t.boules.indexOf(nums[i]) === -1) { match = false; break; } } if (match) resultats.push(t); });
    } else {
        var totalCible = parseInt(document.getElementById('rechTotalSomme').value, 10), nbBoules = parseInt(document.getElementById('rechNbBoules').value, 10);
        if (isNaN(totalCible)) { alert("Entrez un total."); return; }
        source.forEach(function(t) { var combs = obtenirCombinaisons(t.boules, nbBoules), match = false; for (var j = 0; j < combs.length; j++) { if (combs[j].reduce(function(a,b){return a+b;}, 0) === totalCible) { match = true; break; } } if (match) resultats.push(t); });
    }
    var box = document.getElementById('resultatRecherche'); box.style.display = 'block';
    var tbody = document.getElementById('tbodyResultatsRecherche'); tbody.innerHTML = "";
    if (resultats.length === 0) { tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Aucun résultat.</td></tr>"; return; }
    resultats.forEach(function(t) {
        var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital'), idxGlobal = donneesCloud.indexOf(t) + 1;
        var tr = document.createElement('tr');
        tr.innerHTML = "<td><b>L." + idxGlobal + "</b></td><td>" + t.date + " " + t.heure + "</td><td>" + t.jeu + "</td><td>" + t.boules.map(function(b){return "<span class='ball "+c+"'>"+b+"</span>";}).join("") + "</td><td>" + t.somme + "</td>";
        tbody.appendChild(tr);
    });
}

// --- LABO ---
function remplirSelecteursLabo() {
    var s1 = document.getElementById("selectTirageLabo"); s1.innerHTML = "";
    donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " | " + t.jeu + " " + t.heure; s1.appendChild(o); });
}

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
    var role = document.getElementById("roleUser_" + userId).value, dateFin = document.getElementById("dateUser_" + userId).value || null;
    const { error } = await supabaseClient.from('profils').update({ role: role, date_fin_abonnement: dateFin }).eq('id', userId);
    if(error) alert("Erreur: " + error.message); else alert("✅ Utilisateur mis à jour !");
}

async function actualiserDashboard() {
    var total = donneesCloud.length;
    document.getElementById('dashTotal').textContent = total.toLocaleString('fr-FR');
    document.getElementById('dashStar').textContent = donneesCloud.filter(function(t){return t.jeu==='Star';}).length;
    document.getElementById('dashFortune').textContent = donneesCloud.filter(function(t){return t.jeu==='Fortune';}).length;
    document.getElementById('dashDigital').textContent = donneesCloud.filter(function(t){return t.jeu==='Digital';}).length;
    if (total > 0) {
        var dd = donneesCloud.reduce(function(max,t){return t.date>max?t.date:max;}, donneesCloud[0].date);
        document.getElementById('dashDerniereDate').textContent = new Date(dd).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
    }
}

function afficherConnexion() { document.getElementById("form-inscription").style.display = "none"; document.getElementById("form-connexion").style.display = "block"; }
function afficherInscription() { document.getElementById("form-connexion").style.display = "none"; document.getElementById("form-inscription").style.display = "block"; }
var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]'), panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) { var s = (t.id === 'tab-' + id); t.setAttribute('aria-selected', s ? 'true' : 'false'); t.classList.toggle('active', s); });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  ajouterAtelier(id); majBarreAteliers();
  if (btn) btn.focus();
  
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') { remplirSelecteursLabo(); }
  if (id === 'boules') remplirBoulesGrid(); // <-- Ajouté
  if (id === 'comparateur') { mettreAJourZoneComparaison(); } // <-- Ajouté
};
document.addEventListener('DOMContentLoaded', function() { 
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date(); 
    verifierSession(); 
});
