const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U'; // Ta clé ici
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [], estAdmin = false, estAbonne = false;
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var tiragesComparateur = [], tirageLabo = null, nPlages = 0, importAttente = null;

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); }); }

// 1. MENU & ATELIERS
function ouvrirDrawer() { document.getElementById('drawerMenu').classList.add('open'); document.getElementById('drawerBackdrop').classList.add('open'); }
function fermerDrawer() { document.getElementById('drawerMenu').classList.remove('open'); document.getElementById('drawerBackdrop').classList.remove('open'); }
function seDeconnecterDepuisDrawer() { fermerDrawer(); seDeconnecter(); }
function majBarreAteliers() {
    var bar = document.getElementById('ateliersBar'), topOnglets = ['saisie', 'cockpit', 'analyses'];
    var ateliersFiltres = ateliersOuverts.filter(function(id) { return topOnglets.indexOf(id) === -1; });
    if (ateliersFiltres.length === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex"; bar.innerHTML = "";
    ateliersFiltres.forEach(function(id) {
        var icone = "🔧", btnOnglet = document.getElementById('tab-' + id);
        if(btnOnglet) icone = btnOnglet.textContent.trim().split(' ')[0];
        var btn = document.createElement('button'); btn.className = "atelier-btn" + (document.getElementById('onglet-' + id).classList.contains('active') ? " active" : "");
        btn.innerHTML = icone + "<span class='atelier-close' onclick='retirerAtelier(event, \"" + id + "\")'>✕</span>";
        btn.onclick = function() { _ouvrirOnglet(id, btnOnglet); };
        bar.appendChild(btn);
    });
}
function ajouterAtelier(id) {
    if (['saisie', 'cockpit', 'analyses'].indexOf(id) !== -1) return; 
    if (ateliersOuverts.indexOf(id) === -1) { ateliersOuverts.push(id); localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts)); }
    majBarreAteliers();
}
function retirerAtelier(e, id) {
    e.stopPropagation(); ateliersOuverts = ateliersOuverts.filter(function(a) { return a !== id; });
    localStorage.setItem('loto_ateliers', JSON.stringify(ateliersOuverts)); majBarreAteliers();
    if(document.getElementById('onglet-' + id).classList.contains('active')) _ouvrirOnglet('saisie', document.getElementById('tab-saisie'));
}

// 2. NAVIGATION
var _ouvrirOnglet = function(id, btn) {
  var tabs = document.querySelectorAll('[role="tab"]'), panels = document.querySelectorAll('[role="tabpanel"]');
  tabs.forEach(function(t) { var s = (t.id === 'tab-' + id); t.setAttribute('aria-selected', s ? 'true' : 'false'); t.classList.toggle('active', s); });
  panels.forEach(function(p) { p.classList.toggle('active', p.id === 'onglet-' + id); });
  ajouterAtelier(id); majBarreAteliers(); if (btn) btn.focus();
  if (id === 'cockpit') actualiserCockpit();
  if (id === 'recherche') initialiserRecherche();
  if (id === 'labo') remplirSelecteursLabo();
  if (id === 'boules') remplirBoulesGrid();
  if (id === 'analyses') executerAnalyses();
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); _ouvrirOnglet(id, document.getElementById('tab-' + id)); }

// 3. AUTH
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
    if (error) { msg.textContent = "❌ " + error.message; } else { msg.textContent = "✅"; setTimeout(() => { verifierSession(); }, 500); }
}
async function creerCompte() {
    var email = document.getElementById("insEmail").value, phone = document.getElementById("insPhone").value, password = document.getElementById("insPassword").value, msg = document.getElementById("loginMessage");
    if (!email || !password || !phone) { msg.textContent = "Remplissez tout."; return; }
    const { error } = await supabaseClient.auth.signUp({ email: email, password: password, options: { data: { telephone: phone } } });
    if (error) { msg.textContent = "❌ " + error.message; } else { msg.textContent = "✅ Compte créé !"; setTimeout(() => { afficherConnexion(); }, 2000); }
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
    var db = document.getElementById('drawerBadge'); if (db) { db.textContent = badgeEl.textContent; db.className = badgeEl.className; }
    var dash = document.getElementById('dashboardAdmin'); if (dash) dash.style.display = isAdmin ? "block" : "none";
    chargerDonnees(); if (isAdmin) chargerUtilisateursAuto();
}

// 4. UTILITAIRE FILTRAGE PAR SAC
function filtrerParSac(sacId) {
    return donneesCloud.filter(function(t) {
        if (sacId === 'tous' || sacId === 'Star_Fortune_Digital') return true;
        if (sacId === 'Star') return t.jeu === 'Star';
        if (sacId === 'Fortune') return t.jeu === 'Fortune';
        if (sacId === 'Digital') return t.jeu === 'Digital';
        if (sacId === 'Star_Digital') return t.jeu === 'Star' || t.jeu === 'Digital';
        if (sacId === 'Fortune_Digital') return t.jeu === 'Fortune' || t.jeu === 'Digital';
        if (sacId === 'Star_Fortune') return t.jeu === 'Star' || t.jeu === 'Fortune';
        return true;
    });
}

// 5. DONNÉES & COMPILATION
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
    var sacId = document.getElementById("selectSac").value, filtre = document.getElementById("filtrePeriode").value, tf = filtrerParSac(sacId);
    if (filtre === 'recent') { var a = new Date().toISOString().slice(0,10), h = new Date(Date.now()-86400000).toISOString().slice(0,10); tf = tf.filter(function(t) { return t.date === a || t.date === h; }); }
    else if (filtre === 'mois') { var p = new Date().toISOString().slice(0,7); tf = tf.filter(function(t) { return t.date.startsWith(p); }); }
    var conteneur = document.getElementById("conteneurSac"); conteneur.innerHTML = "";
    if (tf.length === 0) { conteneur.innerHTML = "<p>Aucun tirage.</p>"; return; }
    var parDate = {}; tf.forEach(function(t) { if (!parDate[t.date]) parDate[t.date] = []; parDate[t.date].push(t); });
    var html = "";
    Object.keys(parDate).sort().forEach(function(dateStr) {
        var dObj = new Date(dateStr), df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  if (!estAdmin) { return; } var msg = document.getElementById("message"); msg.textContent = "Envoi...";
  var date = document.getElementById("date").value, jeu = document.getElementById("jeuSaisie").value, heure = document.getElementById("heureSaisie").value, boules = [];
  for (var i = 1; i <= 5; i++) { var v = parseInt(document.getElementById("b" + i).value, 10); if (isNaN(v)) { msg.textContent = "Erreur"; return; } boules.push(v); }
  let { error } = await supabaseClient.from('tirages').insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }]);
  if (error) { msg.textContent = "❌"; } else { msg.textContent = "✅"; for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = ""; document.getElementById("filtrePeriode").value = "tout"; chargerDonnees(); }
});

// 6. COCKPIT (Sacs + Sommes)
function actualiserCockpit() {
    var sacId = document.getElementById("cockpitSac").value, h = document.getElementById("cockpitHeure").value;
    var f = filtrerParSac(sacId).filter(function(t){ return (h === "all" || t.heure === h); });
    
    if (f.length === 0) { document.getElementById("cockpitPrediction").innerHTML = "<p>Pas de données.</p>"; return; }
    var freq = {}, ec = {}; for (var n=1;n<=90;n++) { freq[n]=0; ec[n]=0; }
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); }); 
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    var ns = Object.keys(freq).map(function(k){ return { n: parseInt(k,10), f: freq[k], e: ec[k] }; });
    var tc = ns.slice().sort(function(a,b){ return b.f-a.f; }).slice(0,5), tr = ns.slice().sort(function(a,b){ return b.e-a.e; }).slice(0,5);
    
    var sommes = f.map(function(t){ return t.somme; }), sommeMoy = Math.round(sommes.reduce(function(a,b){ return a+b; }, 0) / sommes.length);
    var hp = "<p><b>🔥 Chauds :</b><br>"; tc.forEach(function(x){ hp += "<span class='ball hot' style='background:#e74c3c'>" + x.n + "</span> (" + x.f + "x) "; });
    hp += "</p><p><b>❄️ Retards :</b><br>"; tr.forEach(function(x){ hp += "<span class='ball cold' style='background:#3498db'>" + x.n + "</span> (R:" + x.e + ") "; });
    hp += "</p><div style='margin-top:15px; padding:10px; background:#eee; border-radius:8px;'><b>➕ Sommes :</b> Moyenne = <b>" + sommeMoy + "</b></div>";
    document.getElementById("cockpitPrediction").innerHTML = hp;
    var hc = "<ul class='stat-list'>"; tr.forEach(function(x){ hc += "<li><b>" + x.n + "</b> Retard: " + x.e + "</li>"; }); hc += "</ul>"; document.getElementById("cockpitCycles").innerHTML = hc;
}

// 7. LABO (Bankers, Suivi, Traqueur, etc.)
function remplirSelecteursLabo() {
    var s1 = document.getElementById("selectTirageLabo"); if(s1) { s1.innerHTML = ""; donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " " + t.jeu + " " + t.heure; s1.appendChild(o); }); analyserTirageLabo(); }
    var s2 = document.getElementById("selectMultiTirages"); if(s2) { s2.innerHTML = ""; donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " " + t.jeu; s2.appendChild(o); }); }
    remplirSuiviDeclencheur();
}
function analyserTirageLabo() { var i = document.getElementById("selectTirageLabo").value; if (i !== "" && donneesCloud[i]) { tirageLabo = donneesCloud[i]; document.getElementById("resultatOperations").innerHTML = "Tirage : " + tirageLabo.boules.join(" - "); } }
function faireTurning() { if (!tirageLabo) return; var r = tirageLabo.boules.map(function(n){ var s = n.toString(); if (s.length===1) s = "0"+s; var i = parseInt(s.split('').reverse().join(''),10); return (i>90||i===0)?n:i; }); document.getElementById("resultatOperations").innerHTML = "Miroir : " + r.join(" - "); }
function faireAddition() { if (!tirageLabo) return; var s = tirageLabo.boules.reduce(function(a,b){ return a+b; },0); document.getElementById("resultatOperations").innerHTML = "Somme : " + s; }
function faireTheosophie() { if (!tirageLabo) return; var st = 0; tirageLabo.boules.forEach(function(n) { var s = n.toString(), sn = 0; for (var i=0;i<s.length;i++) sn += parseInt(s[i],10); st += sn; }); var ta = st; while (ta > 90) ta -= 90; document.getElementById("resultatOperations").innerHTML = "Théosophie : " + ta; }
function executerAdditions() { var idx = Array.from(document.getElementById("selectMultiTirages").selectedOptions).map(function(o){ return parseInt(o.value,10); }); var html = "<b>Additions :</b><br>"; idx.forEach(function(i){ var t = donneesCloud[i]; var s = t.boules.reduce(function(a,b){ return a+b; },0); var r = s; while(r > 90) r -= 90; html += t.date + " : " + s + " -> " + r + "<br>"; }); document.getElementById("resultatLaboAvance").innerHTML = html; }
function executerBankersMulti() { var idx = Array.from(document.getElementById("selectMultiTirages").selectedOptions).map(function(o){ return parseInt(o.value,10); }); if(idx.length<2) { document.getElementById("resultatLaboAvance").textContent="Sélectionnez 2+."; return; } var c = donneesCloud[idx[0]].boules.slice(); for(var i=1;i<idx.length;i++) c = c.filter(function(n){ return donneesCloud[idx[i]].boules.indexOf(n)!==-1; }); document.getElementById("resultatLaboAvance").innerHTML = "Communs : " + c.join(", "); }

function chercherBanker() {
    var sac = document.getElementById('bankerJeu').value, tiragesJeu = filtrerParSac(sac);
    if (tiragesJeu.length < 10) { alert("Pas assez de données."); return; }
    var totalTirages = tiragesJeu.length, ecarts = {}; for (var i = 1; i <= 90; i++) ecarts[i] = totalTirages;
    for (var idx = 0; idx < totalTirages; idx++) { tiragesJeu[idx].boules.forEach(function(b) { ecarts[b] = (totalTirages - 1) - idx; }); }
    var maxEcart = -1, numRetard = null; for (var n = 1; n <= 90; n++) if (ecarts[n] > maxEcart) { maxEcart = ecarts[n]; numRetard = n; }
    var freq = {}; for (var f = 1; f <= 90; f++) freq[f] = 0; tiragesJeu.forEach(function(t) { t.boules.forEach(function(b) { freq[b]++; }); });
    var maxFreq = -1, numFrequent = null; for (var m = 1; m <= 90; m++) if (freq[m] > maxFreq) { maxFreq = freq[m]; numFrequent = m; }
    var dernierTirage = tiragesJeu[totalTirages - 1], suiveurs = {};
    for (var k = 0; k < totalTirages - 1; k++) { if (tiragesJeu[k].boules.some(function(b) { return dernierTirage.boules.includes(b); })) { tiragesJeu[k + 1].boules.forEach(function(b) { suiveurs[b] = (suiveurs[b] || 0) + 1; }); } }
    var topSuiveur = null, maxSuivi = -1; for (var s in suiveurs) if (suiveurs[s] > maxSuivi) { maxSuivi = suiveurs[s]; topSuiveur = s; }
    document.getElementById('resultatBanker').style.display = 'block';
    document.getElementById('bankerRetard').innerHTML = "<span class='ball hot' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#e74c3c;'>" + numRetard + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Écart de " + maxEcart + " tirages</b></p>";
    document.getElementById('bankerFrequent').innerHTML = "<span class='ball star' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#f39c12;'>" + numFrequent + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxFreq + " fois</b></p>";
    if (topSuiveur) { document.getElementById('bankerSuiveur').innerHTML = "<span class='ball fortune' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#3498db;'>" + topSuiveur + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxSuivi + " fois</b></p>"; } 
    else { document.getElementById('bankerSuiveur').innerHTML = "<p style='font-size: 12px;'>Pas assez de données.</p>"; }
}

function remplirSuiviDeclencheur() {
    var s = document.getElementById('suiviDeclencheur'); if(!s) return; s.innerHTML="<option value=''>Choisir...</option>";
    for(var i=donneesCloud.length-1; i>=Math.max(0, donneesCloud.length-50); i--) { var opt=document.createElement("option"); opt.value=i; opt.textContent=donneesCloud[i].date+" "+donneesCloud[i].jeu; s.appendChild(opt); }
}
function analyserSuivi() {
    var idx = parseInt(document.getElementById('suiviDeclencheur').value,10); if(isNaN(idx)){alert("Choisissez un tirage.");return;}
    var dec = donneesCloud[idx], res = {}, suiv = [];
    for(var i=idx+1;i<donneesCloud.length;i++){ if(donneesCloud[i].jeu===dec.jeu){suiv.push(donneesCloud[i]); if(suiv.length===5) break;} }
    if(suiv.length===0){ document.getElementById('resultatSuivi').style.display='block'; document.getElementById('resultatSuivi').innerHTML="Aucun tirage suivant."; return; }
    suiv.forEach(function(t){t.boules.forEach(function(b){res[b]=(res[b]||0)+1;});});
    var top = Object.keys(res).map(function(k){return {n:k,c:res[k]};}).sort(function(a,b){return b.c-a.c;}).slice(0,5);
    var html="<b>Top boules suivantes :</b><br>"; top.forEach(function(o){ html+="<span class='ball'>"+o.n+"</span> ("+o.c+"x) "; });
    document.getElementById('resultatSuivi').innerHTML=html; document.getElementById('resultatSuivi').style.display='block';
}

function traquerSomme() {
    var sac = document.getElementById("traqueurSac").value, cible = parseInt(document.getElementById("traqueurSomme").value, 10);
    if (isNaN(cible)) { alert("Entrez une somme."); return; }
    var source = filtrerParSac(sac), alertes = [];
    
    source.forEach(function(t, idx) {
        if (t.somme === cible) {
            var suivants = [];
            for (var i = idx + 1; i < source.length && suivants.length < 5; i++) { suivants.push(source[i]); }
            if (suivants.length === 5) {
                var sortis = [];
                for (var j = 0; j < 4; j++) { suivants[j].boules.forEach(function(b){ if(sortis.indexOf(b)===-1) sortis.push(b); }); }
                var manquantes = [];
                for (var n=1; n<=90; n++) { if (sortis.indexOf(n) === -1) manquantes.push(n); }
                var dernierChance = manquantes.filter(function(n){ return suivants[4].boules.indexOf(n) !== -1; });
                if (dernierChance.length > 0) { alertes.push({ declencheur: t, boules: dernierChance, suivant5: suivants[4] }); }
            }
        }
    });
    
    var box = document.getElementById("resultatTraqueur"); box.style.display = "block";
    if (alertes.length === 0) { box.innerHTML = "<p style='color:var(--text-muted);'>Aucune alerte trouvée.</p>"; return; }
    var html = "<h4 style='color:var(--color-star);'>🚨 Alertes trouvées (" + alertes.length + ")</h4>";
    alertes.slice(-5).reverse().forEach(function(a) {
        html += "<div style='background:#f9f9f9; padding:10px; margin-bottom:10px; border-left:4px solid var(--color-star); border-radius:4px;'>";
        html += "<b>Déclencheur :</b> " + a.declencheur.date + " (Somme: " + cible + ")<br><b>Tirage de la dernière chance :</b> " + a.suivant5.date + " " + a.suivant5.heure + "<br><b>Boules qui ont sauvé leur place :</b><br>";
        a.boules.forEach(function(b){ html += "<span class='ball star'>" + b + "</span> "; }); html += "</div>";
    });
    box.innerHTML = html;
}

// 8. ANALYSES
function executerAnalyses() {
    var sac = document.getElementById('anaJeu').value, source = filtrerParSac(sac);
    if (source.length < 5) { document.getElementById('anaPairesTop10').innerHTML = "<li>Pas assez de données.</li>"; return; }
    var paires = {};
    source.forEach(function(t) { var b = t.boules; for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) { var p = [b[i], b[j]].sort(function(a, c) { return a - c; }).join("-"); paires[p] = (paires[p] || 0) + 1; } });
    var topP = Object.keys(paires).map(function(k) { return { n: k, c: paires[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var htmlP = ""; topP.forEach(function(p) { htmlP += "<li><b>" + p.n.replace("-", " + ") + "</b> <span class='status-badge badge-abonne'>" + p.c + " fois</span></li>"; }); 
    document.getElementById('anaPairesTop10').innerHTML = htmlP || "<li>Aucune.</li>";
}

// 9. BOULES
function remplirBoulesGrid() {
    var grid = document.getElementById('boulesGrid'); if (!grid) return;
    var freq = {}; for (var n=1;n<=90;n++) freq[n]=0;
    donneesCloud.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var maxF = Math.max.apply(null, Object.values(freq).concat([1])), html = "";
    for (var n2=1;n2<=90;n2++) {
        var c = "boule-selecteur"; if (freq[n2] === maxF && maxF > 0) c += " chaud"; else if (freq[n2] === 0 && donneesCloud.length > 0) c += " froid";
        html += "<button type='button' class='" + c + "' data-boule='" + n2 + "' onclick='afficherDetailBoule(" + n2 + ")'>" + n2 + "</button>";
    }
    grid.innerHTML = html;
}
function afficherDetailBoule(num) {
    if (donneesCloud.length === 0) return;
    document.querySelectorAll('.boule-selecteur').forEach(function(b){ b.classList.toggle('active', parseInt(b.dataset.boule,10) === num); });
    var appar = donneesCloud.filter(function(t){ return t.boules.indexOf(num) !== -1; });
    var freq = appar.length, dernier = appar.length > 0 ? appar[appar.length-1] : null, ecart = dernier ? donneesCloud.length - 1 - donneesCloud.indexOf(dernier) : donneesCloud.length;
    var h = "<h3>🔍 Boule " + num + "</h3><div class='boule-stats-grid'><div class='boule-stat'><span class='num'>" + freq + "</span><span class='label'>Sorties</span></div><div class='boule-stat'><span class='num'>" + ecart + "</span><span class='label'>Écart</span></div></div>";
    var d = document.getElementById('bouleDetail'); d.innerHTML = h; d.style.display = 'block';
}

// 10. RECHERCHE
function initialiserRecherche() { var c = document.getElementById('rechBoulesContainer'); if (!c || c.children.length > 0) return; c.innerHTML = ''; ajouterChampRecherche(); ajouterChampRecherche(); }
function ajouterChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length >= 5) return; var div = document.createElement('div'); div.className = 'rech-input-group'; div.innerHTML = `<input type="number" class="rech-num" min="1" max="90" placeholder="N°" style="width:60px;">`; c.appendChild(div); }
function retirerChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length > 1) c.lastElementChild.remove(); }
function changerModeRecherche() { var m = document.getElementById('rechMode').value; document.getElementById('sectionRechBoules').style.display = m === 'boules' ? 'block' : 'none'; document.getElementById('sectionRechSomme').style.display = m === 'somme' ? 'block' : 'none'; document.getElementById('resultatRecherche').style.display = 'none'; }
function obtenirCombinaisons(arr, k) { var res = []; function combiner(debut, actuels) { if (actuels.length === k) { res.push(actuels.slice()); return; } for (var i = debut; i < arr.length; i++) { actuels.push(arr[i]); combiner(i + 1, actuels); actuels.pop(); } } combiner(0, []); return res; }
function executerRecherche() {
    var mode = document.getElementById('rechMode').value, jeu = document.getElementById('rechJeu').value, source = filtrerParSac(jeu), resultats = [];
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
    if (resultats.length === 0) { tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Aucun résultat.</td></tr>"; return; }
    resultats.forEach(function(t) {
        var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital'), idxGlobal = donneesCloud.indexOf(t) + 1;
        var tr = document.createElement('tr'); tr.innerHTML = "<td><b>L." + idxGlobal + "</b></td><td>" + t.date + "</td><td>" + t.jeu + "</td><td>" + t.boules.map(function(b){return "<span class='ball "+c+"'>"+b+"</span>";}).join("") + "</td><td>" + t.somme + "</td>";
        tbody.appendChild(tr);
    });
}

// 11. ADMINISTRATION (Utilisateurs)
async function chargerUtilisateursAuto() {
    var tbody = document.getElementById("tbodyUtilisateurs"), table = document.getElementById("tableUtilisateurs");
    if (!tbody) return; table.style.display = "table"; tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
    const { data: profils } = await supabaseClient.from('profils').select('*').order('role');
    var html = "";
    if(profils) profils.forEach(function(p) {
        var dateVal = p.date_fin_abonnement ? p.date_fin_abonnement.split('T')[0] : '';
        var tel = p.telephone ? p.telephone : "Non renseigné";
        html += "<tr><td>" + (p.email || 'Inconnu') + "</td><td>" + tel + "</td><td>" + p.role + "</td><td><input type='date' value='" + dateVal + "' id='dateUser_" + p.id + "'></td>";
        html += "<td><select id='roleUser_" + p.id + "'><option value='visiteur' "+(p.role==='visiteur'?'selected':'')+">Visiteur</option><option value='abonne' "+(p.role==='abonne'?'selected':'')+">Abonné</option><option value='admin' "+(p.role==='admin'?'selected':'')+">Admin</option></select>";
        html += " <button onclick=\"sauvegarderPrivileges('" + p.id + "')\" style='background:green;'>💾</button></td></tr>";
    });
    tbody.innerHTML = html;
}
async function sauvegarderPrivileges(userId) {
    var role = document.getElementById("roleUser_" + userId).value, dateFin = document.getElementById("dateUser_" + userId).value || null;
    const { error } = await supabaseClient.from('profils').update({ role: role, date_fin_abonnement: dateFin }).eq('id', userId);
    if(error) alert("Erreur: " + error.message); else alert("✅ Mis à jour !");
}
async function actualiserDashboard() {
    var total = donneesCloud.length;
    document.getElementById('dashTotal').textContent = total; document.getElementById('dashStar').textContent = donneesCloud.filter(function(t){return t.jeu==='Star';}).length;
    document.getElementById('dashFortune').textContent = donneesCloud.filter(function(t){return t.jeu==='Fortune';}).length; document.getElementById('dashDigital').textContent = donneesCloud.filter(function(t){return t.jeu==='Digital';}).length;
    if (total > 0) { var dd = donneesCloud.reduce(function(max,t){return t.date>max?t.date:max;}, donneesCloud[0].date); document.getElementById('dashDerniereDate').textContent = new Date(dd).toLocaleDateString('fr-FR'); }
}
function exporterSauvegardeComplete() {
    if (!estAdmin) { return; }
    var l = ["date,heure,jeu,boules"]; donneesCloud.forEach(function(t){ l.push([t.date,t.heure,t.jeu,'"'+t.boules.join(",")+'"'].join(",")); });
    var blob = new Blob([l.join("\n")], { type: "text/csv;charset=utf-8;" }); var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url;
    a.download = "loto-benin-sauvegarde.csv"; a.click(); URL.revokeObjectURL(url);
}

// 12. IMPORT
function parseDateExotique(ligne) {
    var moisMap = { 'janv':1,'jan':1,'janvier':1,'fevr':2,'fev':2,'fevrier':2,'févr':2,'fév':2,'février':2,'mars':3,'mar':3,'avr':4,'avril':4,'mai':5,'juin':6,'juil':7,'juillet':7,'aout':8,'août':8,'sept':9,'septembre':9,'oct':10,'octobre':10,'nov':11,'novembre':11,'dec':12,'déc':12,'decembre':12,'décembre':12 };
    var m;
    m = ligne.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return { jour: parseInt(m[3],10), mois: parseInt(m[2],10), annee: parseInt(m[1],10) };
    m = ligne.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/); if (m) { var a = m[3].length===2 ? parseInt("20"+m[3],10) : parseInt(m[3],10); return { jour: parseInt(m[1],10), mois: parseInt(m[2],10), annee: a }; }
    m = ligne.match(/(\d{1,2})(?:er)?\s+([a-zéèûôàç]+)\.?\s+(\d{2,4})/i); if (m) { var mt = m[2].toLowerCase().replace(/[^a-zéèûôàç]/g,''); var mn = moisMap[mt]; if (mn) { var a2 = m[3].length===2 ? parseInt("20"+m[3],10) : parseInt(m[3],10); return { jour: parseInt(m[1],10), mois: mn, annee: a2 }; } }
    return null;
}
async function traiterTexteColle() {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    var txt = document.getElementById("texteAImporter").value, msg = document.getElementById("importMessage");
    if (!txt.trim()) { msg.textContent = "Vide."; return; } msg.textContent = "Analyse...";
    var lignes = txt.split(/\r?\n/), nv = [], cf = [], inv = 0, aA = new Date().getFullYear(), aMax = aA+1, aMin = 2004;
    lignes.forEach(function(l) {
        if (!l.trim()) return; var ll = l.toLowerCase();
        if (ll.indexOf("date")!==-1 || ll.indexOf("column")!==-1 || ll.indexOf("benin")!==-1) return;
        var d = parseDateExotique(l); if (!d) { inv++; return; }
        if (d.jour<1||d.jour>31||d.mois<1||d.mois>12||d.annee<aMin||d.annee>aMax) { inv++; return; }
        var df = d.annee + "-" + String(d.mois).padStart(2,'0') + "-" + String(d.jour).padStart(2,'0');
        var jt = "Star", ht = "14H";
        if (ll.indexOf("digital")!==-1) jt = "Digital"; else if (ll.indexOf("fortune")!==-1) jt = "Fortune"; else if (/\b(jeu|ven|lun|mar)\b/i.test(l)) jt = "Fortune";
        var mh = l.match(/(\d{1,2})\s*[hH]/); if (mh) ht = mh[1].padStart(2,'0') + "H";
        var tn = l.replace(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/, ' ').replace(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, ' ').replace(/\d{1,2}(?:er)?\s+[a-zéèûôàç]+\.?\s+\d{2,4}/i, ' ').replace(/\b\d{1,2}\s*[hH]\b/g, ' ').replace(/star|fortune|digital|\b(jeu|ven|lun|mar|mer|sam|dom)\b/gi, ' ');
        var ns = [], mn2 = tn.match(/\b\d{1,2}\b/g); if (mn2) for (var i=0;i<mn2.length;i++){ var num = parseInt(mn2[i],10); if (num>=1&&num<=90) ns.push(num); }
        var b = ns.slice(0,5); if (b.length<5) b = ns.slice(-5);
        if (b.length===5 && new Set(b).size===5) {
            var no = { date: df, heure: ht, jeu: jt, boules: JSON.stringify(b), numero_tirage: "Auto", _b: b };
            var ii = nv.findIndex(function(t){ return t.date===no.date && t.heure===no.heure && t.jeu===no.jeu; }); if (ii !== -1) { nv[ii] = no; return; }
            var ic = cf.findIndex(function(c){ return c.nouveau.date===no.date && c.nouveau.heure===no.heure && c.nouveau.jeu===no.jeu; }); if (ic !== -1) { cf[ic].nouveau = no; return; }
            var ex = donneesCloud.find(function(t){ return t.date===no.date && t.heure===no.heure && t.jeu===no.jeu; });
            if (ex) cf.push({ existant: { id: ex.id, date: ex.date, heure: ex.heure, jeu: ex.jeu, boules: ex.boules }, nouveau: no }); else nv.push(no);
        } else { inv++; }
    });
    if (nv.length === 0 && cf.length === 0) { msg.textContent = "Aucun valide (" + inv + ")."; return; }
    importAttente = { nouveaux: nv, conflits: cf, invalides: inv };
    var statNv = document.getElementById("statNouveaux"); if (!statNv) { alert("Modale manquante"); return; }
    statNv.textContent = nv.length; document.getElementById("statConflits").textContent = cf.length; document.getElementById("statInvalides").textContent = inv; document.getElementById("nbConflitsQuestion").textContent = cf.length;
    var ll2 = document.getElementById("listeConflits"); if (cf.length === 0) ll2.innerHTML = "<p>Aucun conflit.</p>"; else { var h = ""; cf.slice(0,10).forEach(function(c){ h += "<div class='ligne-conflit'>⚠️ <b>" + c.nouveau.date + "</b> · " + c.nouveau.jeu + "<br>Ancien : " + c.existant.boules.join(",") + "<br>Nouveau : " + c.nouveau._b.join(",") + "</div>"; }); ll2.innerHTML = h; }
    document.getElementById("btnEcraser").style.display = cf.length > 0 ? "inline-block" : "none";
    document.getElementById("modalConflitImport").style.display = "flex"; document.getElementById("messageConflit").textContent = ""; msg.textContent = "En attente.";
}
async function executerImport(mode) {
    if (!importAttente) return; var msg = document.getElementById("messageConflit"), mp = document.getElementById("importMessage"); msg.textContent = "⏳...";
    var nv = importAttente.nouveaux, cf = importAttente.conflits, nbA = 0, nbE = 0, nbI = 0, err = null;
    if (mode === 'ecraser' && cf.length > 0) {
        var tb = 20;
        for (var i=0;i<cf.length;i+=tb) { var batch = cf.slice(i,i+tb); var ps = batch.map(function(c){ return supabaseClient.from('tirages').update({ boules: c.nouveau.boules }).eq('id', c.existant.id); }); var rs = await Promise.all(ps); for (var r=0;r<rs.length;r++) if (rs[r].error) { err = rs[r].error; break; } if (err) break; nbE += batch.length; }
    } else { nbI = cf.length; }
    if (!err && nv.length > 0) {
        var tp = 100, ai = nv.map(function(t){ return { date: t.date, heure: t.heure, jeu: t.jeu, boules: t.boules, numero_tirage: t.numero_tirage }; });
        for (var j=0;j<ai.length;j+=tp) { var paq = ai.slice(j,j+tp); var res = await supabaseClient.from('tirages').insert(paq); if (res.error) { err = res.error; break; } nbA += paq.length; }
    }
    if (err) { msg.textContent = "❌ " + err.message; return; }
    var res2 = "✅ Terminé. " + nbA + " ajoutés, " + (mode==='ecraser'?nbE+" écrasés":nbI+" ignorés"); msg.textContent = res2; mp.textContent = res2;
    importAttente = null; document.getElementById("texteAImporter").value = ""; setTimeout(function(){ document.getElementById("modalConflitImport").style.display = "none"; chargerDonnees(); }, 1500);
}
function annulerImport() { importAttente = null; document.getElementById("modalConflitImport").style.display = "none"; }

function changerTailleBoules(t) { localStorage.setItem('loto_taille_boules', t); document.body.className = t; }

document.addEventListener('DOMContentLoaded', function() { 
    var t = localStorage.getItem('loto_taille_boules') || 'taille-normale'; document.body.className = t; document.getElementById("selectTailleBoules").value = t;
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date(); verifierSession(); 
});
