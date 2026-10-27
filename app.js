const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [], estAdmin = false, estAbonne = false;
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var tiragesComparateur = [], tirageLabo = null, nPlages = 0, importAttente = null;

// ===== CACHE & OPTIMISATION =====
var CACHE_TTL_MS = 30000;              // 30 secondes
var PAGE_SIZE = 200;                    // tirages chargés au départ
var AFFICHAGE_LIMITE = 100;             // tirages affichés par défaut
var cacheTimestamp = 0;
var chargementEnCours = false;
var plusAncienCharge = null;            // date du tirage le plus ancien en mémoire

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

// ============================================================
// 5. DONNÉES & COMPILATION — VERSION OPTIMISÉE
// ============================================================
async function chargerDonnees(force) {
    // Cache : si données fraîches et pas de force, on ne refait rien
    var now = Date.now();
    if (!force && donneesCloud.length > 0 && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return;
    }
    if (chargementEnCours) return;
    chargementEnCours = true;

    var statusEl = document.getElementById("statusCloud");
    if (statusEl) statusEl.textContent = "⏳ Chargement...";

    try {
        // UNE SEULE requête : les PAGE_SIZE tirages les plus récents
        let { data, error } = await supabaseClient
            .from('tirages')
            .select('*')
            .order('date', { ascending: false })
            .order('heure', { ascending: false })
            .limit(PAGE_SIZE);

        if (error) throw error;

        var tous = data || [];

        donneesCloud = tous.map(function(item) {
            var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
            return {
                id: item.id,
                date: item.date,
                jeu: item.jeu,
                heure: item.heure,
                boules: arr,
                somme: arr.reduce(function(a, b) { return a + b; }, 0)
            };
        });

        // On remet dans l'ordre chronologique croissant (le plus ancien d'abord)
        donneesCloud.reverse();

        // Mémorise la date la plus ancienne chargée (pour savoir si on peut charger plus)
        plusAncienCharge = donneesCloud.length > 0 ? donneesCloud[0].date : null;
        cacheTimestamp = now;

        if (statusEl) statusEl.textContent = "✅ Connecté ! (" + donneesCloud.length + " tirages récents)";

        afficherSacSelectionne();
        if (estAdmin) actualiserDashboard();
    } catch (err) {
        console.error("chargerDonnees:", err);
        if (statusEl) statusEl.textContent = "❌ Erreur chargement";
    } finally {
        chargementEnCours = false;
    }
}

// Charge PAGE_SIZE tirages plus anciens (bouton "Charger plus")
async function chargerPlusAnciens() {
    if (!plusAncienCharge || chargementEnCours) return;
    chargementEnCours = true;
    var statusEl = document.getElementById("statusCloud");
    if (statusEl) statusEl.textContent = "⏳ Chargement anciens...";
    try {
        let { data, error } = await supabaseClient
            .from('tirages')
            .select('*')
            .lt('date', plusAncienCharge)
            .order('date', { ascending: false })
            .order('heure', { ascending: false })
            .limit(PAGE_SIZE);

        if (error) throw error;

        if (!data || data.length === 0) {
            if (statusEl) statusEl.textContent = "✅ Tous les tirages sont chargés.";
            chargementEnCours = false;
            return;
        }

        var nouveaux = data.map(function(item) {
            var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
            return {
                id: item.id, date: item.date, jeu: item.jeu, heure: item.heure,
                boules: arr, somme: arr.reduce(function(a, b) { return a + b; }, 0)
            };
        }).reverse();

        donneesCloud = nouveaux.concat(donneesCloud);
        plusAncienCharge = donneesCloud[0].date;
        cacheTimestamp = Date.now();

        if (statusEl) statusEl.textContent = "✅ Connecté ! (" + donneesCloud.length + " tirages)";
        afficherSacSelectionne();
        if (estAdmin) actualiserDashboard();
    } catch (err) {
        console.error("chargerPlusAnciens:", err);
        if (statusEl) statusEl.textContent = "❌ Erreur";
    } finally {
        chargementEnCours = false;
    }
}

function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value, filtre = document.getElementById("filtrePeriode").value;
    var tf = filtrerParSac(sacId);

    if (filtre === 'recent') {
        var a = new Date().toISOString().slice(0, 10), h = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        tf = tf.filter(function(t) { return t.date === a || t.date === h; });
    } else if (filtre === 'mois') {
        var p = new Date().toISOString().slice(0, 7);
        tf = tf.filter(function(t) { return t.date.startsWith(p); });
    }

    var conteneur = document.getElementById("conteneurSac");
    if (!conteneur) return;
    conteneur.innerHTML = "";

    if (tf.length === 0) { conteneur.innerHTML = "<p>Aucun tirage.</p>"; return; }

    // Limite d'affichage pour rester fluide (les plus récents d'abord)
    var tfAffiches = tf.slice(-AFFICHAGE_LIMITE).reverse();

    // Regroupement par date
    var parDate = {};
    tfAffiches.forEach(function(t) {
        if (!parDate[t.date]) parDate[t.date] = [];
        parDate[t.date].push(t);
    });

    // Construction en DOM fragment (évite le re-parse d'un gros innerHTML)
    var fragment = document.createDocumentFragment();

    Object.keys(parDate).sort().reverse().forEach(function(dateStr) {
        var dObj = new Date(dateStr);
        var df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var dayCard = document.createElement('div');
        dayCard.className = 'day-card';
        var h3 = document.createElement('h3');
        h3.className = 'day-header';
        h3.textContent = '📅 ' + df;
        dayCard.appendChild(h3);

        parDate[dateStr].forEach(function(t) {
            var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
            var row = document.createElement('div');
            row.className = 'day-row';

            var time = document.createElement('div');
            time.className = 'day-time';
            time.textContent = t.heure;

            var game = document.createElement('div');
            game.className = 'day-game';
            game.textContent = t.jeu;

            var nums = document.createElement('div');
            nums.className = 'day-nums';
            t.boules.forEach(function(b) {
                var span = document.createElement('span');
                span.className = 'ball ' + c;
                span.textContent = b;
                nums.appendChild(span);
            });

            row.appendChild(time);
            row.appendChild(game);
            row.appendChild(nums);
            dayCard.appendChild(row);
        });

        fragment.appendChild(dayCard);
    });

    conteneur.appendChild(fragment);

    // Bouton "Charger plus" si on a tronqué l'affichage
    if (tf.length > AFFICHAGE_LIMITE) {
        var btn = document.createElement('button');
        btn.textContent = "⬇️ Afficher plus de tirages (" + (tf.length - AFFICHAGE_LIMITE) + " restants)";
        btn.style.cssText = "margin:15px auto; display:block; padding:10px 20px; background:#3498db; color:#fff; border:none; border-radius:8px; cursor:pointer;";
        btn.onclick = function() {
            AFFICHAGE_LIMITE += 100;
            afficherSacSelectionne();
        };
        conteneur.appendChild(btn);
    }
}

// ============================================================
// BOUTON AJOUTER — VERSION OPTIMISÉE
// ============================================================
document.getElementById("btnAjouter")?.addEventListener("click", async function () {
    if (!estAdmin) return;

    var msg = document.getElementById("message");
    msg.textContent = "Envoi...";

    var date = document.getElementById("date").value;
    var jeu = document.getElementById("jeuSaisie").value;
    var heure = document.getElementById("heureSaisie").value;
    var boules = [];

    for (var i = 1; i <= 5; i++) {
        var v = parseInt(document.getElementById("b" + i).value, 10);
        if (isNaN(v)) { msg.textContent = "Erreur"; return; }
        boules.push(v);
    }

    // Insert + select pour récupérer la vraie ligne (avec son vrai id)
    let { data, error } = await supabaseClient
        .from('tirages')
        .insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }])
        .select()
        .single();

    if (error) {
        msg.textContent = "❌ Erreur";
        return;
    }

    msg.textContent = "✅ Enregistré !";
    for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = "";

    // Cache invalidé pour forcer un refresh propre la prochaine fois
    cacheTimestamp = 0;

    var datePlusAncienne = donneesCloud.length > 0 ? donneesCloud[0].date : date;

    if (date < datePlusAncienne) {
        // Date plus ancienne que ce qui est chargé : on recharge la page courante
        msg.textContent = "✅ Enregistré ! Mise à jour...";
        await chargerDonnees(true);
    } else {
        // Ajout en mémoire avec la VRAIE ligne renvoyée par Supabase
        var nouveauTirage = {
            id: data.id,
            date: data.date,
            jeu: data.jeu,
            heure: data.heure,
            boules: typeof data.boules === 'string' ? JSON.parse(data.boules) : data.boules,
            somme: boules.reduce(function(a, b) { return a + b; }, 0)
        };
        donneesCloud.push(nouveauTirage);
        donneesCloud.sort(function(a, b) {
            return a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure);
        });
    }

    document.getElementById("filtrePeriode").value = "tout";
    afficherSacSelectionne();
    actualiserDashboard();
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
    var hp = "<p><b>🔥 Chauds :</b><br>";
    tc.forEach(function(x){ hp += "<span class='ball hot' style='background:#e74c3c'>" + x.n + "</span> (" + x.f + "x) "; });
    hp += "</p><p><b>❄️ Retards :</b><br>";
    tr.forEach(function(x){ hp += "<span class='ball cold' style='background:#3498db'>" + x.n + "</span> (R:" + x.e + ") "; });
    hp += "</p><div style='margin-top:15px; padding:10px; background:#eee; border-radius:8px;'><b>➕ Sommes :</b> Moyenne = <b>" + sommeMoy + "</b></div>";
    document.getElementById("cockpitPrediction").innerHTML = hp;
    var hc = "<ul class='stat-list'>";
    tr.forEach(function(x){ hc += "<li><b>" + x.n + "</b> Retard: " + x.e + "</li>"; });
    hc += "</ul>"; document.getElementById("cockpitCycles").innerHTML = hc;
}

// 7. LABO (Bankers, Suivi, Traqueur, etc.)
function remplirSelecteursLabo() {
    var s1 = document.getElementById("selectTirageLabo");
    if(s1) { s1.innerHTML = ""; donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " " + t.jeu + " " + t.heure; s1.appendChild(o); }); analyserTirageLabo(); }
    var s2 = document.getElementById("selectMultiTirages");
    if(s2) { s2.innerHTML = ""; donneesCloud.forEach(function(t,i){ var o = document.createElement("option"); o.value = i; o.textContent = t.date + " " + t.jeu; s2.appendChild(o); }); }
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
            var
