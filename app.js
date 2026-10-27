const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U'; // <-- Vérifie que c'est bien TA clé ici
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var estAdmin = false;
var estAbonne = false;
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var tiragesComparateur = [];
var tirageLabo = null;
var nPlages = 0;

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); }); }

// --- 1. MENU LATÉRAL (DRAWER) ---
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

// --- 2. BARRE DES ATELIERS (WORKSPACE) ---
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

// --- 3. NAVIGATION ---
var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]'), panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) { var s = (t.id === 'tab-' + id); t.setAttribute('aria-selected', s ? 'true' : 'false'); t.classList.toggle('active', s); });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  ajouterAtelier(id); majBarreAteliers();
  if (btn) btn.focus();
  
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') remplirSelecteursLabo();
  if (id === 'boules') remplirBoulesGrid();
  if (id === 'comparateur') mettreAJourZoneComparaison();
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); _ouvrirOnglet(id, document.getElementById('tab-' + id)); }

// --- 4. AUTHENTIFICATION ---
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
function afficherConnexion() { document.getElementById("form-inscription").style.display = "none"; document.getElementById("form-connexion").style.display = "block"; document.getElementById("loginMessage").textContent = ""; }
function afficherInscription() { document.getElementById("form-connexion").style.display = "none"; document.getElementById("form-inscription").style.display = "block"; document.getElementById("loginMessage").textContent = ""; }

function afficherApplication(isAdmin, isAbonne, dateFin) {
    document.getElementById("login-screen").style.display = "none"; document.getElementById("app-content").style.display = "block";
    var badgeEl = document.getElementById("statusBadge");
    if (isAdmin) { badgeEl.textContent = "👑 Admin"; badgeEl.className = "status-badge badge-admin"; document.body.classList.remove("mode-visiteur"); }
    else if (isAbonne) { badgeEl.textContent = "⭐ Abonné"; badgeEl.className = "status-badge badge-abonne"; document.body.classList.remove("mode-visiteur"); }
    else { badgeEl.textContent = "🚫 Gratuit"; badgeEl.className = "status-badge badge-gratuit"; document.body.classList.add("mode-visiteur"); }
        var db = document.getElementById('drawerBadge');
    if (db) { db.textContent = badgeEl.textContent; db.className = badgeEl.className; }
    
    var dash = document.getElementById('dashboardAdmin');     var db = document.getElementById('drawerBadge');
    if (db) { db.textContent = badgeEl.textContent; db.className = badgeEl.className; }
    
    var dash = document.getElementById('dashboardAdmin'); 
    var dash = document.getElementById('dashboardAdmin'); if (dash) dash.style.display = isAdmin ? "block" : "none";
    chargerDonnees(); if (isAdmin) chargerUtilisateursAuto();
}

// --- 5. DONNÉES & COMPILATION ---
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
                var dObj = new Date(dateStr);
        var df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        html += "<div class='day-card'><h3 class='day-header'>📅 " + df + "</h3>";
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

// --- 6. COCKPIT ---
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

// --- 7. ANALYSES ---
function executerAnalyses() {
    var jeu = document.getElementById('anaJeu').value, source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    if (source.length < 5) { document.getElementById('anaPairesTop10').innerHTML = "<li>Pas assez de données.</li>"; return; }
    var paires = {};
    source.forEach(function(t) { var b = t.boules; for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) { var p = [b[i], b[j]].sort(function(a, c) { return a - c; }).join("-"); paires[p] = (paires[p] || 0) + 1; } });
    var topP = Object.keys(paires).map(function(k) { return { n: k, c: paires[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var htmlP = ""; topP.forEach(function(p) { htmlP += "<li><b>" + p.n.replace("-", " + ") + "</b> <span class='status-badge badge-abonne'>" + p.c + " fois</span></li>"; }); 
    document.getElementById('anaPairesTop10').innerHTML = htmlP || "<li>Aucune.</li>";
}

// --- 8. CHERCHEUR ---
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

// --- 9. LES BOULES ---
function remplirBoulesGrid() {
    var grid = document.getElementById('boulesGrid'); if (!grid) return;
    var freq = {}; for (var n=1;n<=90;n++) freq[n]=0;
    donneesCloud.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var maxF = Math.max.apply(null, Object.values(freq).concat([1]));
    var html = "";
    for (var n2=1;n2<=90;n2++) {
        var c = "boule-selecteur";
        if (freq[n2] === maxF && maxF > 0) c += " chaud";
        else if (freq[n2] === 0 && donneesCloud.length > 0) c += " froid";
        html += "<button type='button' class='" + c + "' data-boule='" + n2 + "' onclick='afficherDetailBoule(" + n2 + ")'>" + n2 + "</button>";
    }
    grid.innerHTML = html;
}
function afficherDetailBoule(num) {
    if (donneesCloud.length === 0) return;
    document.querySelectorAll('.boule-selecteur').forEach(function(b){ b.classList.toggle('active', parseInt(b.dataset.boule,10) === num); });
    var appar = donneesCloud.filter(function(t){ return t.boules.indexOf(num) !== -1; });
    var freq = appar.length, dernier = appar.length > 0 ? appar[appar.length-1] : null, ecart = dernier ? donneesCloud.length - 1 - donneesCloud.indexOf(dernier) : donneesCloud.length;
    var h = "<h3>🔍 Boule " + num + "</h3><div class='boule-stats-grid'><div class='boule-stat'><span class='num'>" + freq + "</span><span class='label'>Sorties</span></div><div class='boule-stat'><span class='num'>" + ecart + "</span><span class='label'>Écart</span></div><div class='boule-stat'><span class='num'>" + (dernier ? dernier.date : '—') + "</span><span class='label'>Dernier</span></div><div class='boule-stat'><span class='num'>" + (donneesCloud.length>0 ? Math.round(freq/donneesCloud.length*1000)/10 : 0) + "%</span><span class='label'>Fréquence</span></div></div>";
    if (appar.length > 0) {
        h += "<p><b>📜 20 dernières apparitions :</b></p>";
        appar.slice(-20).reverse().forEach(function(t) {
            h += "<div class='boule-historique-ligne'><span class='date'>" + t.date + "</span><span class='jeu'>" + t.jeu + "</span><span class='heure'>" + t.heure + "</span><span class='boules'>";
            t.boules.forEach(function(b){ h += "<span class='boule-mini" + (b===num?" cible":"") + "'>" + b + "</span>"; }); h += "</span></div>";
        });
    } else { h += "<p>Jamais sortie.</p>"; }
    var d = document.getElementById('bouleDetail'); d.innerHTML = h; d.style.display = 'block';
}

// --- 10. COMPARATEUR ---
function ajouterPlage() {
    if (nPlages >= 5) { alert("Max 5."); return; }
    nPlages++;
    var d = document.createElement("div"); d.className = "plage-box"; d.id = "plage-container-" + nPlages; d.style.borderTop = "4px solid #2980b9";
    d.innerHTML = `<label>Plage ${nPlages}</label><select id="sacNum${nPlages}"><option value="tous">Tous</option><option value="Star">Star</option><option value="Fortune">Fortune</option><option value="Digital">Digital</option></select><div style="display:flex; gap:5px;"><input type="number" id="refNum${nPlages}" placeholder="Ligne N°" style="width:80px;"><select id="refRange${nPlages}" style="flex:1;"><option value="10">10</option><option value="20">20</option><option value="30" selected>30</option></select></div><button class="danger" style="font-size:12px;" onclick="supprimerPlage(${nPlages})">Retirer</button>`;
    document.getElementById("plages-config").appendChild(d);
}
function supprimerPlage(id) { var d = document.getElementById("plage-container-" + id); if (d) { d.remove(); nPlages--; } }
function executerComparateurMulti() {
    var plages = [];
    if (tiragesComparateur.length > 0) plages.push({ id: "Sélection", nomSac: "🎯 Chercheur", data: tiragesComparateur.map(function(t, idx) { return { data: t, ligneLocale: idx + 1 }; }), color: "#e74c3c" });
    for (var i=1;i<=nPlages;i++) {
        var c = document.getElementById("plage-container-" + i); if (!c) continue;
        var s = document.getElementById("sacNum" + i).value, rl = parseInt(document.getElementById("refNum" + i).value, 10), rg = parseInt(document.getElementById("refRange" + i).value, 10);
        if (isNaN(rl)) continue;
        var td = donneesCloud.filter(function(t){ return s === 'tous' || t.jeu === s; }), si = rl - 1;
        if (si < 0 || si >= td.length) { alert("Ligne " + rl + " n'existe pas."); return; }
        var p = [], mn = Math.max(0, si-rg), mx = Math.min(td.length-1, si+rg); for (var j=mn;j<=mx;j++) p.push({ data: td[j], ligneLocale: j+1 });
        plages.push({ id: i, nomSac: "Plage " + i, data: p, color: ["#2980b9","#d35400","#c0392b","#27ae60","#8e44ad"][(i-1)%5] });
    }
    if (plages.length < 2) { alert("Il faut au moins 2 colonnes."); return; }
    var ml = 0; plages.forEach(function(p){ if (p.data.length > ml) ml = p.data.length; });
    var html = "";
    plages.forEach(function(p) {
        html += "<div class='comp-col' style='border-top: 4px solid " + p.color + ";'><h3 style='text-align:center; color:" + p.color + ";'>" + p.nomSac + "</h3><table class='comp-table'><tbody>";
        for (var l=0;l<ml;l++) {
            var it = p.data[l]; if (!it) { html += "<tr><td><i>-</i></td><td>-</td></tr>"; continue; }
            var t = it.data; html += "<tr><td><b>L." + it.ligneLocale + "</b><br><small>" + t.date + "</small></td><td>";
            t.boules.forEach(function(n) { html += "<span class='comp-ball'>" + n + "</span>"; }); html += "</td></tr>";
        }
        html += "</tbody></table></div>";
    });
    document.getElementById("resultatComparaison").innerHTML = html;
}
function mettreAJourZoneComparaison() {
    var zone = document.getElementById('zoneComparaison'), liste = document.getElementById('listeComparaison');
    if (!zone || !liste) return;
    if (tiragesComparateur.length === 0) { zone.style.display = 'none'; return; }
    zone.style.display = 'block'; liste.innerHTML = "";
    tiragesComparateur.forEach(function(t, idx) {
        var div = document.createElement('div'); div.className = "comp-tag";
        div.innerHTML = "<b>L." + (donneesCloud.indexOf(t) + 1) + "</b> (" + t.jeu + ") <button onclick='retirerDuComparateur(" + idx + ")'>✕</button>";
        liste.appendChild(div);
    });
}
function retirerDuComparateur(idx) { tiragesComparateur.splice(idx, 1); mettreAJourZoneComparaison(); }
function viderZoneComparaison() { tiragesComparateur = []; mettreAJourZoneComparaison(); }

// --- 11. LABO ---
function remplirSelecteursLabo() {
    var s1 = document.getElementById("selectTirageLabo"); 
    if(s1) {
        s1.innerHTML = "";
        donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " | " + t.jeu + " " + t.heure; s1.appendChild(o); });
        analyserTirageLabo();
    }
    
    var s2 = document.getElementById("selectMultiTirages"); 
    if(s2) { 
        s2.innerHTML = ""; 
        donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " | " + t.jeu + " " + t.heure; s2.appendChild(o); }); 
    }

    // L'APPEL QUI MANQUAIT POUR L'ANALYSEUR DE SUIVI :
    remplirSuiviDeclencheur(); 
}
function analyserTirageLabo() { var i = document.getElementById("selectTirageLabo").value; if (i !== "" && donneesCloud[i]) { tirageLabo = donneesCloud[i]; document.getElementById("resultatOperations").innerHTML = "Tirage : " + tirageLabo.boules.join(" - "); } }
function faireTurning() { if (!tirageLabo) return; var r = tirageLabo.boules.map(function(n){ var s = n.toString(); if (s.length===1) s = "0"+s; var i = parseInt(s.split('').reverse().join(''),10); return (i>90||i===0)?n:i; }); document.getElementById("resultatOperations").innerHTML = "<b>Miroir :</b><br>Base : " + tirageLabo.boules.join(" - ") + "<br>Miroir : <span style='color:#9b59b6; font-weight:bold;'>" + r.join(" - ") + "</span>"; }
function faireAddition() { if (!tirageLabo) return; var s = tirageLabo.boules.reduce(function(a,b){ return a+b; },0), r = s; while (r > 90) r -= 90; document.getElementById("resultatOperations").innerHTML = "<b>Somme :</b><br>" + tirageLabo.boules.join(" + ") + " = " + s + "<br>Réduit : <strong>" + r + "</strong>"; }
function faireTheosophie() { if (!tirageLabo) return; var st = 0, cd = []; tirageLabo.boules.forEach(function(n) { var s = n.toString(), sn = 0, dn = []; for (var i=0;i<s.length;i++) { var c = parseInt(s[i],10); sn += c; dn.push(c); } st += sn; cd.push(dn.join("+") + "=" + sn); }); var ta = st, rt = ""; while (ta > 90) { ta -= 90; rt += " -> " + ta; } document.getElementById("resultatOperations").innerHTML = "<b>Théosophie :</b><br>" + cd.join(" | ") + "<br><b>Total : " + st + "</b><br>" + (rt ? "Réduction : " + rt + "<br>" : "") + "Résultat : <span class='ball'>" + ta + "</span>"; }

// --- 12. ADMINISTRATION ---
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
    if (total > 0) { var dd = donneesCloud.reduce(function(max,t){return t.date>max?t.date:max;}, donneesCloud[0].date); document.getElementById('dashDerniereDate').textContent = new Date(dd).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}); }
}

// --- INITIALISATION ---
// =========================================================
// OUTILS DU LABORATOIRE (Bankers, Suivi, Multi-Draws)
// =========================================================

// 1. Chasseur de Bankers
function chercherBanker() {
    var jeuChoisi = document.getElementById('bankerJeu').value;
    var resultatBox = document.getElementById('resultatBanker');
    var tiragesJeu = donneesCloud.filter(function(t) { return t.jeu === jeuChoisi; });
    
    if (tiragesJeu.length < 10) { alert("Pas assez de données pour analyser."); return; }
    var totalTirages = tiragesJeu.length;
    
    // Le plus en retard
    var ecarts = {}; for (var i = 1; i <= 90; i++) ecarts[i] = totalTirages;
    for (var idx = 0; idx < totalTirages; idx++) { tiragesJeu[idx].boules.forEach(function(b) { ecarts[b] = (totalTirages - 1) - idx; }); }
    var maxEcart = -1, numRetard = null; for (var n = 1; n <= 90; n++) if (ecarts[n] > maxEcart) { maxEcart = ecarts[n]; numRetard = n; }
    
    // Le plus régulier
    var freq = {}; for (var f = 1; f <= 90; f++) freq[f] = 0; 
    tiragesJeu.forEach(function(t) { t.boules.forEach(function(b) { freq[b]++; }); });
    var maxFreq = -1, numFrequent = null; for (var m = 1; m <= 90; m++) if (freq[m] > maxFreq) { maxFreq = freq[m]; numFrequent = m; }
    
    // Le suiveur
    var dernierTirage = tiragesJeu[totalTirages - 1], suiveurs = {};
    for (var k = 0; k < totalTirages - 1; k++) { 
        if (tiragesJeu[k].boules.some(function(b) { return dernierTirage.boules.includes(b); })) { 
            tiragesJeu[k + 1].boules.forEach(function(b) { suiveurs[b] = (suiveurs[b] || 0) + 1; }); 
        } 
    }
    var topSuiveur = null, maxSuivi = -1; for (var s in suiveurs) if (suiveurs[s] > maxSuivi) { maxSuivi = suiveurs[s]; topSuiveur = s; }
    
    // Affichage
    resultatBox.style.display = 'block';
    document.getElementById('bankerRetard').innerHTML = "<span class='ball hot' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#e74c3c;'>" + numRetard + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Écart de " + maxEcart + " tirages</b></p>";
    document.getElementById('bankerFrequent').innerHTML = "<span class='ball star' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#f39c12;'>" + numFrequent + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxFreq + " fois</b></p>";
    
    if (topSuiveur) {
        document.getElementById('bankerSuiveur').innerHTML = "<span class='ball fortune' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#3498db;'>" + topSuiveur + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxSuivi + " fois</b></p>";
    } else {
        document.getElementById('bankerSuiveur').innerHTML = "<p style='font-size: 12px;'>Pas assez de données.</p>";
    }
}

// 2. Analyseur de Suivi
function remplirSuiviDeclencheur() {
    var sel = document.getElementById('suiviDeclencheur'); 
    if (!sel) return; 
    sel.innerHTML = "<option value=''>Sélectionnez un tirage déclencheur...</option>"; 
    var limit = Math.max(0, donneesCloud.length - 50); 
    for (var i = donneesCloud.length - 1; i >= limit; i--) { 
        var t = donneesCloud[i], opt = document.createElement("option"); 
        opt.value = i; opt.textContent = t.date + " | " + t.jeu + " " + t.heure; 
        sel.appendChild(opt); 
    } 
}

function analyserSuivi() {
    var idxSel = document.getElementById('suiviDeclencheur').value; 
    if (idxSel === "") { alert("Sélectionnez un tirage."); return; }
    var idx = parseInt(idxSel, 10), declencheur = donneesCloud[idx], resultats = {}, tiragesSuivants = [];
    
    for (var i = idx + 1; i < donneesCloud.length; i++) { 
        if (donneesCloud[i].jeu === declencheur.jeu) { 
            tiragesSuivants.push(donneesCloud[i]); 
            if (tiragesSuivants.length === 5) break; 
        } 
    }
    
    var box = document.getElementById('resultatSuivi'); 
    if (tiragesSuivants.length === 0) { box.style.display = 'block'; box.innerHTML = "<p>Aucun tirage suivant trouvé.</p>"; return; }
    
    tiragesSuivants.forEach(function(t) { t.boules.forEach(function(b) { resultats[b] = (resultats[b] || 0) + 1; }); });
    var top = Object.keys(resultats).map(function(k) { return { n: parseInt(k, 10), c: resultats[k] }; }).sort(function(a, b) { return b.c - a.c; });
    
    var html = "<h4 style='margin-top:0; color:var(--color-star);'>Résultats du suivi</h4><p style='font-size: 13px; margin-bottom: 15px;'>Analyse des <b>" + tiragesSuivants.length + "</b> tirages suivants (jeu " + declencheur.jeu + ").</p><div class='ana-grid'>";
    top.slice(0, 5).forEach(function(item) { 
        var pourcentage = Math.round((item.c / tiragesSuivants.length) * 100); 
        html += "<div class='ana-card' style='display:flex; align-items:center; gap:10px; padding: 10px;'><span class='ball fortune' style='width:50px; height:50px; font-size:20px;'>" + item.n + "</span><div><b>Sorti " + item.c + " fois</b><br><span style='font-size:12px;'>(" + pourcentage + "%)</span></div></div>"; 
    });
    html += "</div>"; box.innerHTML = html; box.style.display = 'block';
}

// 3. Multi-Draws (Additionner et Communs)
function executerAdditions() {
    var sel = document.getElementById("selectMultiTirages"); 
    var idx = Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value,10); }); 
    if (idx.length === 0) { document.getElementById("resultatLaboAvance").textContent = "Sélectionnez des tirages."; return; } 
    
    var html = "<b>Additions :</b><br>"; 
    idx.forEach(function(i){ 
        var t = donneesCloud[i]; 
        var s = t.boules.reduce(function(a,b){ return a+b; },0); 
        var r = s; while(r > 90) r -= 90; 
        html += t.date + " " + t.heure + " : " + s + " → " + r + "<br>"; 
    }); 
    document.getElementById("resultatLaboAvance").innerHTML = html; 
}

function executerBankersMulti() {
    var sel = document.getElementById("selectMultiTirages"); 
    var idx = Array.from(sel.selectedOptions).map(function(o){ return parseInt(o.value,10); }); 
    if (idx.length < 2) { document.getElementById("resultatLaboAvance").textContent = "Sélectionnez au moins 2 tirages."; return; } 
    
    var communs = donneesCloud[idx[0]].boules.slice(); 
    for (var i=1;i<idx.length;i++) {
        communs = communs.filter(function(n){ return donneesCloud[idx[i]].boules.indexOf(n) !== -1; }); 
    }
    
    var html = "<b>Communs (" + idx.length + " tirages) :</b><br>"; 
    if (communs.length === 0) html += "Aucun numéro commun.";
    else html += communs.map(function(n){ return "<span class='ball' style='background:#e74c3c;'>" + n + "</span>"; }).join(" "); 
    document.getElementById("resultatLaboAvance").innerHTML = html; 
}
function exporterSauvegardeComplete() {
    if (!estAdmin) { alert("Action réservée aux administrateurs."); return; }
    if (donneesCloud.length === 0) { alert("Aucune donnée à exporter."); return; }
    
    var l = ["date,heure,jeu,boules"];
    donneesCloud.forEach(function(t){ 
        l.push([t.date, t.heure, t.jeu, '"' + t.boules.join(",") + '"'].join(",")); 
    });
    
    var blob = new Blob([l.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); 
    a.href = url;
    a.download = "loto-benin-sauvegarde-" + new Date().toISOString().slice(0,10) + ".csv";
    a.click(); 
    URL.revokeObjectURL(url);
}

function chargerUtilisateursDansTableau() {
    // Si ta fonction s'appelle chargerUtilisateursAuto, tu peux juste l'appeler ici
    if (typeof chargerUtilisateursAuto === 'function') {
        chargerUtilisateursAuto();
    }
}
// =========================================================
// IMPORTATION DE DONNÉES (AVEC GESTION DES CONFLITS)
// =========================================================
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

    // ... (garde tout le début de la fonction qui analyse les lignes) ...

    if (nv.length === 0 && cf.length === 0) { 
        msg.style.color = "var(--color-star)"; 
        msg.textContent = "⚠️ Aucun valide (" + inv + " invalides)."; 
        return; 
    }
    
    importAttente = { nouveaux: nv, conflits: cf, invalides: inv };
    
    // VÉRIFICATION DE SÉCURITÉ :
    var modal = document.getElementById("modalConflitImport");
    if (!modal) {
        // Si la fenêtre n'existe pas, on utilise une alerte classique
        var resume = "📥 Résumé :\n" + nv.length + " nouveaux\n" + cf.length + " conflits\n" + inv + " invalides.\n\n";
        if (cf.length > 0) {
            if (confirm(resume + "Voulez-vous écraser les anciens ?")) {
                executerImport('ecraser');
            } else {
                executerImport('ignorer');
            }
        } else {
            alert(resume + "Ajout en cours...");
            executerImport('ignorer');
        }
        return;
    }

    // Si la fenêtre existe, on affiche les détails normalement
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
    modal.style.display = "flex";
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
    
    if (err) { 
        msg.style.color = "var(--color-hot)"; msg.textContent = "❌ " + err.message; 
        document.querySelectorAll("#modalConflitImport button").forEach(function(b){ b.disabled = false; }); 
        return; 
    }
    
    var res2 = "✅ Terminé. " + nbA + " ajouté(s)" + (mode==='ecraser' ? ", " + nbE + " écrasé(s)" : ", " + nbI + " ignoré(s)") + ".";
    msg.style.color = "#27ae60"; msg.textContent = res2;
    mp.style.color = "#27ae60"; mp.textContent = res2;
    
    importAttente = null;
    document.getElementById("texteAImporter").value = "";
    setTimeout(function(){ document.getElementById("modalConflitImport").style.display = "none"; chargerDonnees(); }, 1500);
}

function annulerImport() {
    importAttente = null;
    document.getElementById("modalConflitImport").style.display = "none";
    document.getElementById("importMessage").style.color = "var(--color-star)";
    document.getElementById("importMessage").textContent = "⏹️ Annulé.";
}
document.addEventListener('DOMContentLoaded', function() { 
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date(); 
    verifierSession(); 
});
