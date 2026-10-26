const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var estAdmin = false;
var estAbonne = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); });
}

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
      document.getElementById("filtrePeriode").value = "tout"; // Affiche tout
      chargerDonnees(); 
  }
});

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

function afficherConnexion() { document.getElementById("form-inscription").style.display = "none"; document.getElementById("form-connexion").style.display = "block"; }
function afficherInscription() { document.getElementById("form-connexion").style.display = "none"; document.getElementById("form-inscription").style.display = "block"; }

document.addEventListener('DOMContentLoaded', function() {
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
    verifierSession();
});
