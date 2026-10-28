// ============================================================
// GARDE-FOU : vérifier que Supabase CDN est chargé
// ============================================================
if (typeof supabase === 'undefined') {
    console.error("❌ ERREUR CRITIQUE : Supabase CDN non chargé !");
    console.error("👉 Dans index.html, la ligne <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> doit être AVANT <script src='app.js'></script>");
}

const supabaseUrl = 'https://owaggqstbwlpqtetdwxh.supabase.co';
const supabaseKey = 'sb_publishable_K0JnNQTYJoEn_AfoH4hi4Q_WpTggV4U';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

var donneesCloud = [];
var estAdmin = false;
var estAbonne = false;
var ateliersOuverts = JSON.parse(localStorage.getItem('loto_ateliers')) || [];
var tiragesComparateur = [];
var tirageLabo = null;
var nPlages = 0;
var importAttente = null;

// ===== CACHE & OPTIMISATION =====
var CACHE_TTL_MS = 60000;
var PAGE_SIZE_INITIAL = 200;
var PAGE_SIZE_BG = 1000;
var AFFICHAGE_LIMITE = 100;
var cacheTimestamp = 0;
var chargementEnCours = false;
var chargementComplet = false;
var plusAncienCharge = null;
var totalAttendu = 0;

var LS_KEY_TIRAGES = 'loto_cache_tirages_v1';
var LS_KEY_TS = 'loto_cache_tirages_ts_v1';

if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js'); }); }

// ============================================================
// 1. MENU LATÉRAL (DRAWER)
// ============================================================
function ouvrirDrawer() {
    document.getElementById('drawerMenu').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    if (document.getElementById('btnBurger')) document.getElementById('btnBurger').setAttribute('aria-expanded', 'true');
}
function fermerDrawer() {
    document.getElementById('drawerMenu').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
    if (document.getElementById('btnBurger')) document.getElementById('btnBurger').setAttribute('aria-expanded', 'false');
}
function seDeconnecterDepuisDrawer() { fermerDrawer(); seDeconnecter(); }

// ============================================================
// 2. BARRE DES ATELIERS
// ============================================================
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

// ============================================================
// 3. NAVIGATION
// ============================================================
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
    if (id === 'analyses') executerAnalyses();
    if (id === 'comparateur') mettreAJourZoneComparaison();
};
function ouvrirOnglet(id, btn) { _ouvrirOnglet(id, btn); }
function ouvrirOngletDepuisDrawer(id) { fermerDrawer(); _ouvrirOnglet(id, document.getElementById('tab-' + id)); }

// ============================================================
// 4. AUTHENTIFICATION
// ============================================================
async function verifierSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const { data: profil } = await supabaseClient.from('profils').select('*').eq('id', session.user.id).single();
            let role = profil ? profil.role : 'visiteur', dateFin = null, dateValide = false;
            if (profil && profil.date_fin_abonnement) { dateFin = new Date(profil.date_fin_abonnement); dateValide = !isNaN(dateFin.getTime()); }
            estAdmin = (role === 'admin');
            estAbonne = (role === 'admin') || (dateValide && dateFin > new Date());
            afficherApplication(estAdmin, estAbonne, dateValide ? dateFin : null);
        } else {
            document.getElementById("login-screen").style.display = "flex";
            document.getElementById("app-content").style.display = "none";
        }
    } catch (e) { console.error("verifierSession:", e); }
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
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    var badgeEl = document.getElementById("statusBadge");
    if (isAdmin) { badgeEl.textContent = "👑 Admin"; badgeEl.className = "status-badge badge-admin"; document.body.classList.remove("mode-visiteur"); }
    else if (isAbonne) { badgeEl.textContent = "⭐ Abonné"; badgeEl.className = "status-badge badge-abonne"; document.body.classList.remove("mode-visiteur"); }
    else { badgeEl.textContent = "🚫 Gratuit"; badgeEl.className = "status-badge badge-gratuit"; document.body.classList.add("mode-visiteur"); }
    var db = document.getElementById('drawerBadge');
    if (db) { db.textContent = badgeEl.textContent; db.className = badgeEl.className; }
    var dash = document.getElementById('dashboardAdmin');
    if (dash) dash.style.display = isAdmin ? "block" : "none";
    chargerDonnees(); if (isAdmin) chargerUtilisateursAuto();
}

// ============================================================
// 5. FILTRAGE PAR SAC
// ============================================================
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
// 6. CACHE LOCAL
// ============================================================
function restaurerCacheLocal() {
    try {
        var raw = localStorage.getItem(LS_KEY_TIRAGES);
        var ts = parseInt(localStorage.getItem(LS_KEY_TS) || '0', 10);
        if (raw && ts && (Date.now() - ts) < 24 * 3600 * 1000) {
            var arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
                donneesCloud = arr;
                plusAncienCharge = donneesCloud[0].date;
                cacheTimestamp = ts;
                chargementComplet = arr.length >= 500;
                return true;
            }
        }
    } catch (e) { console.warn("restaurerCacheLocal:", e); }
    return false;
}
function sauvegarderCacheLocal() {
    try {
        localStorage.setItem(LS_KEY_TIRAGES, JSON.stringify(donneesCloud));
        localStorage.setItem(LS_KEY_TS, String(Date.now()));
    } catch (e) {
        console.warn("sauvegarderCacheLocal:", e);
        try { localStorage.removeItem(LS_KEY_TIRAGES); } catch(_) {}
    }
}
function majCompteurChargement(charge, total) {
    var statusEl = document.getElementById("statusCloud");
    if (!statusEl) return;
    if (chargementComplet) statusEl.textContent = "✅ " + charge + " tirages (historique complet)";
    else if (total > 0) statusEl.textContent = "⏳ " + charge + " / " + total + " tirages...";
    else statusEl.textContent = "⏳ " + charge + " tirages...";
}

// ============================================================
// 7. CHARGEMENT DES DONNÉES (optimisé)
// ============================================================
async function chargerDonnees(force) {
    var now = Date.now();
    if (!force && donneesCloud.length > 0 && (now - cacheTimestamp) < CACHE_TTL_MS) return;

    if (!force && donneesCloud.length === 0) {
        if (restaurerCacheLocal()) {
            majCompteurChargement(donneesCloud.length, 0);
            afficherSacSelectionne();
            if (estAdmin) actualiserDashboard();
            setTimeout(function () { chargerDonnees(true); }, 1500);
            return;
        }
    }

    if (chargementEnCours) return;
    chargementEnCours = true;
    chargementComplet = false;

    var statusEl = document.getElementById("statusCloud");
    if (statusEl) statusEl.textContent = "⏳ Chargement...";

    try {
        try {
            let { count } = await supabaseClient.from('tirages').select('*', { count: 'exact', head: true });
            totalAttendu = count || 0;
        } catch (e) { totalAttendu = 0; }

        let { data, error } = await supabaseClient
            .from('tirages')
            .select('*')
            .order('date', { ascending: false })
            .order('heure', { ascending: false })
            .limit(PAGE_SIZE_INITIAL);

        if (error) throw error;

        donneesCloud = (data || []).map(function (item) {
            var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
            return { id: item.id, date: item.date, jeu: item.jeu, heure: item.heure, boules: arr, somme: arr.reduce(function (a, b) { return a + b; }, 0) };
        }).reverse();

        plusAncienCharge = donneesCloud.length > 0 ? donneesCloud[0].date : null;
        cacheTimestamp = now;
        majCompteurChargement(donneesCloud.length, totalAttendu);

        afficherSacSelectionne();
        if (estAdmin) actualiserDashboard();

        chargerResteEnArrierePlan();
    } catch (err) {
        console.error("chargerDonnees:", err);
        if (statusEl) statusEl.textContent = "❌ Erreur chargement";
    } finally {
        chargementEnCours = false;
    }
}
async function chargerResteEnArrierePlan() {
    while (plusAncienCharge && !chargementComplet) {
        try {
            let { data, error } = await supabaseClient
                .from('tirages')
                .select('*')
                .lt('date', plusAncienCharge)
                .order('date', { ascending: false })
                .order('heure', { ascending: false })
                .limit(PAGE_SIZE_BG);

            if (error) { console.warn("chargerResteEnArrierePlan:", error); break; }
            if (!data || data.length === 0) { chargementComplet = true; break; }

            var ids = {};
            donneesCloud.forEach(function(t) { ids[t.id] = true; });
            var nouveaux = data
                .filter(function (item) { return !ids[item.id]; })
                .map(function (item) {
                    var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
                    return { id: item.id, date: item.date, jeu: item.jeu, heure: item.heure, boules: arr, somme: arr.reduce(function (a, b) { return a + b; }, 0) };
                })
                .reverse();

            donneesCloud = nouveaux.concat(donneesCloud);
            plusAncienCharge = donneesCloud[0].date;
            majCompteurChargement(donneesCloud.length, totalAttendu);
            if (data.length < PAGE_SIZE_BG) chargementComplet = true;

            afficherSacSelectionne();
            if (estAdmin) actualiserDashboard();

            await new Promise(function (r) { setTimeout(r, 100); });
        } catch (e) { console.warn("Erreur background:", e); break; }
    }

    chargementComplet = true;
    cacheTimestamp = Date.now();
    sauvegarderCacheLocal();
    majCompteurChargement(donneesCloud.length, totalAttendu);
    if (typeof remplirSelecteursLabo === 'function') remplirSelecteursLabo();
}

// ============================================================
// 8. AFFICHAGE COMPILATION
// ============================================================
function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value;
    var filtre = document.getElementById("filtrePeriode") ? document.getElementById("filtrePeriode").value : "tout";
    var tf = filtrerParSac(sacId);

    if (filtre === 'recent') {
        var a = new Date().toISOString().slice(0, 10), h = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        tf = tf.filter(function (t) { return t.date === a || t.date === h; });
    } else if (filtre === 'mois') {
        var p = new Date().toISOString().slice(0, 7);
        tf = tf.filter(function (t) { return t.date.startsWith(p); });
    }

    var conteneur = document.getElementById("conteneurSac");
    if (!conteneur) return;
    conteneur.innerHTML = "";

    if (tf.length === 0) { conteneur.innerHTML = "<p>Aucun tirage.</p>"; return; }

    var tfAffiches = tf.slice(-AFFICHAGE_LIMITE).reverse();
    var parDate = {};
    tfAffiches.forEach(function (t) { if (!parDate[t.date]) parDate[t.date] = []; parDate[t.date].push(t); });

    var fragment = document.createDocumentFragment();
    Object.keys(parDate).sort().reverse().forEach(function (dateStr) {
        var dObj = new Date(dateStr);
        var df = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var dayCard = document.createElement('div');
        dayCard.className = 'day-card';
        var h3 = document.createElement('h3');
        h3.className = 'day-header';
        h3.textContent = '📅 ' + df;
        dayCard.appendChild(h3);

        parDate[dateStr].forEach(function (t) {
            var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
            var row = document.createElement('div');
            row.className = 'day-row';
            var time = document.createElement('div'); time.className = 'day-time'; time.textContent = t.heure;
            var game = document.createElement('div'); game.className = 'day-game'; game.textContent = t.jeu;
            var nums = document.createElement('div'); nums.className = 'day-nums';
            t.boules.forEach(function (b) { var span = document.createElement('span'); span.className = 'ball ' + c; span.textContent = b; nums.appendChild(span); });
            row.appendChild(time); row.appendChild(game); row.appendChild(nums); dayCard.appendChild(row);
        });
        fragment.appendChild(dayCard);
    });
    conteneur.appendChild(fragment);

    if (tf.length > AFFICHAGE_LIMITE) {
        var info = document.createElement('p');
        info.style.cssText = "text-align:center; color:#888; margin-top:10px; font-size:13px;";
        info.textContent = "Affichage des " + AFFICHAGE_LIMITE + " plus récents sur " + tf.length + " au total.";
        conteneur.appendChild(info);
        var btn = document.createElement('button');
        btn.textContent = "⬇️ Afficher 100 de plus";
        btn.style.cssText = "margin:10px auto; display:block; padding:10px 20px; background:#3498db; color:#fff; border:none; border-radius:8px; cursor:pointer;";
        btn.onclick = function () { AFFICHAGE_LIMITE += 100; afficherSacSelectionne(); };
        conteneur.appendChild(btn);
    }

    if (!chargementComplet) {
        var bandeau = document.createElement('div');
        bandeau.style.cssText = "text-align:center; padding:8px; background:#fff3cd; color:#856404; border-radius:6px; margin-top:10px; font-size:13px;";
        bandeau.textContent = "⏳ Historique en cours de chargement (" + donneesCloud.length + (totalAttendu ? " / " + totalAttendu : "") + ")...";
        conteneur.appendChild(bandeau);
    }
}

// ============================================================
// 9. BOUTON AJOUTER (optimisé)
// ============================================================
document.getElementById("btnAjouter")?.addEventListener("click", async function () {
    if (!estAdmin) { alert("Admin uniquement."); return; }
    var msg = document.getElementById("message"); msg.textContent = "Envoi..."; msg.style.color = "blue";

    var date = document.getElementById("date").value;
    var jeu = document.getElementById("jeuSaisie").value;
    var heure = document.getElementById("heureSaisie").value;
    var boules = [];

    for (var i = 1; i <= 5; i++) {
        var v = parseInt(document.getElementById("b" + i).value, 10);
        if (isNaN(v)) { msg.textContent = "Erreur boules"; return; }
        boules.push(v);
    }

    let { data, error } = await supabaseClient
        .from('tirages')
        .insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }])
        .select()
        .single();

    if (error) { msg.textContent = "❌ Erreur."; msg.style.color = "red"; return; }

    msg.textContent = "✅ Tirage enregistré !"; msg.style.color = "green";
    for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = "";

    var nouveauTirage = {
        id: data.id, date: data.date, jeu: data.jeu, heure: data.heure,
        boules: typeof data.boules === 'string' ? JSON.parse(data.boules) : data.boules,
        somme: boules.reduce(function (a, b) { return a + b; }, 0)
    };

    if (!donneesCloud.some(function (t) { return t.id === nouveauTirage.id; })) {
        donneesCloud.push(nouveauTirage);
        donneesCloud.sort(function (a, b) { return a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure); });
    }

    totalAttendu = Math.max(totalAttendu, donneesCloud.length);
    cacheTimestamp = Date.now();
    sauvegarderCacheLocal();

    if (document.getElementById("filtrePeriode")) document.getElementById("filtrePeriode").value = "tout";
    afficherSacSelectionne();
    actualiserDashboard();
});

// ============================================================
// 10. COCKPIT
// ============================================================
function actualiserCockpit() {
    var jeu = document.getElementById("cockpitJeu").value;
    var h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });

    if (f.length === 0) {
        document.getElementById("cockpitPrediction").innerHTML = "<p>Pas de données.</p>";
        document.getElementById("cockpitCycles").innerHTML = "<p>Pas de données.</p>";
        return;
    }

    var freq = {}, ec = {};
    for (var n=1;n<=90;n++) { freq[n]=0; ec[n]=0; }
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });

    var ns = Object.keys(freq).map(function(k){ return { n: parseInt(k,10), f: freq[k], e: ec[k] }; });
    var tc = ns.slice().sort(function(a,b){ return b.f-a.f; }).slice(0,5);
    var tr = ns.slice().sort(function(a,b){ return b.e-a.e; }).slice(0,5);

    var hp = "<p><b>🔥 Chauds :</b><br>";
    tc.forEach(function(x){ hp += "<span class='ball hot' style='background:#e74c3c'>" + x.n + "</span> (" + x.f + "x) "; });
    hp += "</p><p style='margin-top:15px;'><b>❄️ Retards :</b><br>";
    tr.forEach(function(x){ hp += "<span class='ball cold' style='background:#3498db'>" + x.n + "</span> (R:" + x.e + ") "; });
    hp += "</p>";
    document.getElementById("cockpitPrediction").innerHTML = hp;

    var hc = "<ul style='list-style:none; padding:0;'>";
    tr.forEach(function(x){ hc += "<li style='padding:5px 0; border-bottom:1px dashed #ccc;'><b>" + x.n + "</b> Retard: " + x.e + "</li>"; });
    hc += "</ul>";
    document.getElementById("cockpitCycles").innerHTML = hc;
}

function genererGrilleCockpit() {
    var jeu = document.getElementById("cockpitJeu").value;
    var h = document.getElementById("cockpitHeure").value;
    var f = donneesCloud.filter(function(t){ return t.jeu === jeu && (h === "all" || t.heure === h); });
    if (f.length < 10) { document.getElementById("grilleGeneree").textContent = "Pas assez de données."; return; }

    var freq = {};
    for (var n=1;n<=90;n++) freq[n]=0;
    f.forEach(function(t){ t.boules.forEach(function(b){ freq[b]++; }); });
    var tc = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; }).slice(0,3).map(Number);

    var ec = {};
    for (var n2=1;n2<=90;n2++) ec[n2]=0;
    f.forEach(function(t,idx){ t.boules.forEach(function(b){ if (ec[b]===0 && idx!==0) ec[b]=idx; }); });
    if (f.length > 0) f[0].boules.forEach(function(b){ ec[b]=0; });
    var tr = Object.keys(ec).sort(function(a,b){ return ec[b]-ec[a]; }).slice(0,2).map(Number);

    var cb = tc.concat(tr);
    cb = [...new Set(cb)];
    while(cb.length < 5) {
        var r = Math.floor(Math.random()*90)+1;
        if(cb.indexOf(r)===-1) cb.push(r);
    }
    cb.sort(function(a,b){ return a-b; });
    document.getElementById("grilleGeneree").innerHTML = "🎲 " + cb.join(" - ");
}

// ============================================================
// 11. ANALYSES
// ============================================================
function executerAnalyses() {
    var jeu = document.getElementById('anaJeu').value;
    var source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    if (source.length < 5) { document.getElementById('anaPairesTop10').innerHTML = "<li>Pas assez de données.</li>"; return; }
    var paires = {};
    source.forEach(function(t) {
        var b = t.boules;
        for (var i = 0; i < b.length; i++)
            for (var j = i + 1; j < b.length; j++) {
                var p = [b[i], b[j]].sort(function(a, c) { return a - c; }).join("-");
                paires[p] = (paires[p] || 0) + 1;
            }
    });
    var topP = Object.keys(paires).map(function(k) { return { n: k, c: paires[k] }; }).sort(function(a, b) { return b.c - a.c; }).slice(0, 10);
    var htmlP = ""; topP.forEach(function(p) { htmlP += "<li><b>" + p.n.replace("-", " + ") + "</b> <span class='status-badge badge-abonne'>" + p.c + " fois</span></li>"; });
    document.getElementById('anaPairesTop10').innerHTML = htmlP || "<li>Aucune.</li>";
}

// ============================================================
// 12. CHERCHEUR
// ============================================================
function initialiserRecherche() { var c = document.getElementById('rechBoulesContainer'); if (!c || c.children.length > 0) return; c.innerHTML = ''; ajouterChampRecherche(); ajouterChampRecherche(); }
function ajouterChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length >= 5) return; var div = document.createElement('div'); div.className = 'rech-input-group'; div.innerHTML = '<input type="number" class="rech-num" min="1" max="90" placeholder="N°" style="width:60px;">'; c.appendChild(div); }
function retirerChampRecherche() { var c = document.getElementById('rechBoulesContainer'); if (c.children.length > 1) c.lastElementChild.remove(); }
function changerModeRecherche() { var m = document.getElementById('rechMode').value; document.getElementById('sectionRechBoules').style.display = m === 'boules' ? 'block' : 'none'; document.getElementById('sectionRechSomme').style.display = m === 'somme' ? 'block' : 'none'; document.getElementById('resultatRecherche').style.display = 'none'; }
function obtenirCombinaisons(arr, k) { var res = []; function combiner(debut, actuels) { if (actuels.length === k) { res.push(actuels.slice()); return; } for (var i = debut; i < arr.length; i++) { actuels.push(arr[i]); combiner(i + 1, actuels); actuels.pop(); } } combiner(0, []); return res; }
function executerRecherche() {
    var mode = document.getElementById('rechMode').value;
    var jeu = document.getElementById('rechJeu').value;
    var source = donneesCloud.filter(function(t) { return jeu === 'tous' || t.jeu === jeu; });
    var resultats = [];
    if (mode === 'boules') {
        var nums = [];
        document.querySelectorAll('.rech-num').forEach(function(inp) { var v = parseInt(inp.value, 10); if (!isNaN(v)) nums.push(v); });
        if (nums.length === 0) { alert("Entrez au moins une boule."); return; }
        source.forEach(function(t) { var match = true; for (var i = 0; i < nums.length; i++) { if (t.boules.indexOf(nums[i]) === -1) { match = false; break; } } if (match) resultats.push(t); });
    } else {
        var totalCible = parseInt(document.getElementById('rechTotalSomme').value, 10);
        var nbBoules = parseInt(document.getElementById('rechNbBoules').value, 10);
        if (isNaN(totalCible)) { alert("Entrez un total."); return; }
        source.forEach(function(t) { var combs = obtenirCombinaisons(t.boules, nbBoules), match = false; for (var j = 0; j < combs.length; j++) { if (combs[j].reduce(function(a,b){return a+b;}, 0) === totalCible) { match = true; break; } } if (match) resultats.push(t); });
    }
    var box = document.getElementById('resultatRecherche'); box.style.display = 'block';
    var tbody = document.getElementById('tbodyResultatsRecherche'); tbody.innerHTML = "";
    if (resultats.length === 0) { tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Aucun résultat.</td></tr>"; return; }
    resultats.forEach(function(t) {
        var c = t.jeu === 'Star' ? 'star' : (t.jeu === 'Fortune' ? 'fortune' : 'digital');
        var idxGlobal = donneesCloud.indexOf(t) + 1;
        var tr = document.createElement('tr');
        tr.innerHTML = "<td><b>L." + idxGlobal + "</b></td><td>" + t.date + " " + t.heure + "</td><td>" + t.jeu + "</td><td>" + t.boules.map(function(b){return "<span class='ball "+c+"'>"+b+"</span>";}).join("") + "</td><td>" + t.somme + "</td>";
        tbody.appendChild(tr);
    });
}

// ============================================================
// 13. LES BOULES (version enrichie d'origine)
// ============================================================
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
    var freq = appar.length;
    var dernier = appar.length > 0 ? appar[appar.length-1] : null;
    var ecart = dernier ? donneesCloud.length - 1 - donneesCloud.indexOf(dernier) : donneesCloud.length;
    var h = "<h3>🔍 Boule " + num + "</h3><div class='boule-stats-grid'><div class='boule-stat'><span class='num'>" + freq + "</span><span class='label'>Sorties</span></div><div class='boule-stat'><span class='num'>" + ecart + "</span><span class='label'>Écart</span></div><div class='boule-stat'><span class='num'>" + (dernier ? dernier.date : '—') + "</span><span class='label'>Dernier</span></div><div class='boule-stat'><span class='num'>" + (donneesCloud.length>0 ? Math.round(freq/donneesCloud.length*1000)/10 : 0) + "%</span><span class='label'>Fréquence</span></div></div>";
    if (appar.length > 0) {
        h += "<p><b>📜 20 dernières apparitions :</b></p>";
        appar.slice(-20).reverse().forEach(function(t) {
            h += "<div class='boule-historique-ligne'><span class='date'>" + t.date + "</span><span class='jeu'>" + t.jeu + "</span><span class='heure'>" + t.heure + "</span><span class='boules'>";
            t.boules.forEach(function(b){ h += "<span class='boule-mini" + (b===num?" cible":"") + "'>" + b + "</span>"; });
            h += "</span></div>";
        });
    } else { h += "<p>Jamais sortie.</p>"; }
    var d = document.getElementById('bouleDetail'); d.innerHTML = h; d.style.display = 'block';
}

// ============================================================
// 14. COMPARATEUR (version d'origine)
// ============================================================
function ajouterPlage() {
    if (nPlages >= 5) { alert("Max 5."); return; }
    nPlages++;
    var d = document.createElement("div");
    d.className = "plage-box";
    d.id = "plage-container-" + nPlages;
    d.style.borderTop = "4px solid #2980b9";
    d.innerHTML = '<label>Plage ' + nPlages + '</label>' +
        '<select id="sacNum' + nPlages + '"><option value="tous">Tous</option><option value="Star">Star</option><option value="Fortune">Fortune</option><option value="Digital">Digital</option></select>' +
        '<div style="display:flex; gap:5px;"><input type="number" id="refNum' + nPlages + '" placeholder="Ligne N°" style="width:80px;">' +
        '<select id="refRange' + nPlages + '" style="flex:1;"><option value="10">10</option><option value="20">20</option><option value="30" selected>30</option></select></div>' +
        '<button class="danger" style="font-size:12px;" onclick="supprimerPlage(' + nPlages + ')">Retirer</button>';
    document.getElementById("plages-config").appendChild(d);
}
function supprimerPlage(id) { var d = document.getElementById("plage-container-" + id); if (d) { d.remove(); nPlages--; } }
function executerComparateurMulti() {
    var plages = [];
    if (tiragesComparateur.length > 0) plages.push({ id: "Sélection", nomSac: "🎯 Chercheur", data: tiragesComparateur.map(function(t, idx) { return { data: t, ligneLocale: idx + 1 }; }), color: "#e74c3c" });
    for (var i=1;i<=nPlages;i++) {
        var c = document.getElementById("plage-container-" + i); if (!c) continue;
        var s = document.getElementById("sacNum" + i).value;
        var rl = parseInt(document.getElementById("refNum" + i).value, 10);
        var rg = parseInt(document.getElementById("refRange" + i).value, 10);
        if (isNaN(rl)) continue;
        var td = donneesCloud.filter(function(t){ return s === 'tous' || t.jeu === s; });
        var si = rl - 1;
        if (si < 0 || si >= td.length) { alert("Ligne " + rl + " n'existe pas."); return; }
        var p = [], mn = Math.max(0, si-rg), mx = Math.min(td.length-1, si+rg);
        for (var j=mn;j<=mx;j++) p.push({ data: td[j], ligneLocale: j+1 });
        plages.push({ id: i, nomSac: "Plage " + i, data: p, color: ["#2980b9","#d35400","#c0392b","#27ae60","#8e44ad"][(i-1)%5] });
    }
    if (plages.length < 2) { alert("Il faut au moins 2 colonnes."); return; }
    var ml = 0; plages.forEach(function(p){ if (p.data.length > ml) ml = p.data.length; });
    var html = "";
    plages.forEach(function(p) {
        html += "<div class='comp-col' style='border-top: 4px solid " + p.color + ";'><h3 style='text-align:center; color:" + p.color + ";'>" + p.nomSac + "</h3><table class='comp-table'><tbody>";
        for (var l=0;l<ml;l++) {
            var it = p.data[l];
            if (!it) { html += "<tr><td><i>-</i></td><td>-</td></tr>"; continue; }
            var t = it.data;
            html += "<tr><td><b>L." + it.ligneLocale + "</b><br><small>" + t.date + "</small></td><td>";
            t.boules.forEach(function(n) { html += "<span class='comp-ball'>" + n + "</span>"; });
            html += "</td></tr>";
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

// ============================================================
// 15. LABO (complet d'origine + traquerSomme récupéré)
// ============================================================
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
    remplirSuiviDeclencheur();
}
function analyserTirageLabo() { var i = document.getElementById("selectTirageLabo").value; if (i !== "" && donneesCloud[i]) { tirageLabo = donneesCloud[i]; document.getElementById("resultatOperations").innerHTML = "Tirage : " + tirageLabo.boules.join(" - "); } }
function faireTurning() { if (!tirageLabo) return; var r = tirageLabo.boules.map(function(n){ var s = n.toString(); if (s.length===1) s = "0"+s; var i = parseInt(s.split('').reverse().join(''),10); return (i>90||i===0)?n:i; }); document.getElementById("resultatOperations").innerHTML = "<b>Miroir :</b><br>Base : " + tirageLabo.boules.join(" - ") + "<br>Miroir : <span style='color:#9b59b6; font-weight:bold;'>" + r.join(" - ") + "</span>"; }
function faireAddition() { if (!tirageLabo) return; var s = tirageLabo.boules.reduce(function(a,b){ return a+b; },0), r = s; while (r > 90) r -= 90; document.getElementById("resultatOperations").innerHTML = "<b>Somme :</b><br>" + tirageLabo.boules.join(" + ") + " = " + s + "<br>Réduit : <strong>" + r + "</strong>"; }
function faireTheosophie() { if (!tirageLabo) return; var st = 0, cd = []; tirageLabo.boules.forEach(function(n) { var s = n.toString(), sn = 0, dn = []; for (var i=0;i<s.length;i++) { var c = parseInt(s[i],10); sn += c; dn.push(c); } st += sn; cd.push(dn.join("+") + "=" + sn); }); var ta = st, rt = ""; while (ta > 90) { ta -= 90; rt += " -> " + ta; } document.getElementById("resultatOperations").innerHTML = "<b>Théosophie :</b><br>" + cd.join(" | ") + "<br><b>Total : " + st + "</b><br>" + (rt ? "Réduction : " + rt + "<br>" : "") + "Résultat : <span class='ball'>" + ta + "</span>"; }

function chercherBanker() {
    var jeuChoisi = document.getElementById('bankerJeu').value;
    var resultatBox = document.getElementById('resultatBanker');
    var tiragesJeu = donneesCloud.filter(function(t) { return t.jeu === jeuChoisi; });
    if (tiragesJeu.length < 10) { alert("Pas assez de données pour analyser."); return; }
    var totalTirages = tiragesJeu.length;

    var ecarts = {}; for (var i = 1; i <= 90; i++) ecarts[i] = totalTirages;
    for (var idx = 0; idx < totalTirages; idx++) { tiragesJeu[idx].boules.forEach(function(b) { ecarts[b] = (totalTirages - 1) - idx; }); }
    var maxEcart = -1, numRetard = null; for (var n = 1; n <= 90; n++) if (ecarts[n] > maxEcart) { maxEcart = ecarts[n]; numRetard = n; }

    var freq = {}; for (var f = 1; f <= 90; f++) freq[f] = 0;
    tiragesJeu.forEach(function(t) { t.boules.forEach(function(b) { freq[b]++; }); });
    var maxFreq = -1, numFrequent = null; for (var m = 1; m <= 90; m++) if (freq[m] > maxFreq) { maxFreq = freq[m]; numFrequent = m; }

    var dernierTirage = tiragesJeu[totalTirages - 1], suiveurs = {};
    for (var k = 0; k < totalTirages - 1; k++) {
        if (tiragesJeu[k].boules.some(function(b) { return dernierTirage.boules.includes(b); })) {
            tiragesJeu[k + 1].boules.forEach(function(b) { suiveurs[b] = (suiveurs[b] || 0) + 1; });
        }
    }
    var topSuiveur = null, maxSuivi = -1; for (var s in suiveurs) if (suiveurs[s] > maxSuivi) { maxSuivi = suiveurs[s]; topSuiveur = s; }

    resultatBox.style.display = 'block';
    document.getElementById('bankerRetard').innerHTML = "<span class='ball hot' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#e74c3c;'>" + numRetard + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Écart de " + maxEcart + " tirages</b></p>";
    document.getElementById('bankerFrequent').innerHTML = "<span class='ball star' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#f39c12;'>" + numFrequent + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxFreq + " fois</b></p>";
    if (topSuiveur) {
        document.getElementById('bankerSuiveur').innerHTML = "<span class='ball fortune' style='width: 60px; height: 60px; font-size: 26px; margin-bottom: 10px; background:#3498db;'>" + topSuiveur + "</span><p style='font-size: 13px; margin-top: 5px;'><b>Sorti " + maxSuivi + " fois</b></p>";
    } else {
        document.getElementById('bankerSuiveur').innerHTML = "<p style='font-size: 12px;'>Pas assez de données.</p>";
    }
}

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

// ⭐ TRAQUEUR DE SOMME (récupéré de la version optimisée)
function traquerSomme() {
    var sac = document.getElementById("traqueurSac").value;
    var cible = parseInt(document.getElementById("traqueurSomme").value, 10);
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

    var box = document.getElementById("resultatTraqueur"); 
    if (!box) return;
    box.style.display = "block";
    if (alertes.length === 0) { box.innerHTML = "<p style='color:var(--text-muted);'>Aucune alerte trouvée.</p>"; return; }
    var html = "<h4 style='color:var(--color-star);'>🚨 Alertes trouvées (" + alertes.length + ")</h4>";
    alertes.slice(-5).reverse().forEach(function(a) {
        html += "<div style='background:#f9f9f9; padding:10px; margin-bottom:10px; border-left:4px solid var(--color-star); border-radius:4px;'>";
        html += "<b>Déclencheur :</b> " + a.declencheur.date + " (Somme: " + cible + ")<br><b>Tirage de la dernière chance :</b> " + a.suivant5.date + " " + a.suivant5.heure + "<br><b>Boules qui ont sauvé leur place :</b><br>";
        a.boules.forEach(function(b){ html += "<span class='ball star'>" + b + "</span> "; });
        html += "</div>";
    });
    box.innerHTML = html;
}

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

// ============================================================
// 16. ADMINISTRATION
// ============================================================
async function chargerUtilisateursAuto() {
    var tbody = document.getElementById("tbodyUtilisateurs"), table = document.getElementById("tableUtilisateurs");
    if (!tbody) return;
    table.style.display = "table";
    tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
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
    var role = document.getElementById("roleUser_" + userId).value;
    var dateFin = document.getElementById("dateUser_" + userId).value || null;
    const { error } = await supabaseClient.from('profils').update({ role: role, date_fin_abonnement: dateFin }).eq('id', userId);
    if(error) alert("Erreur: " + error.message); else alert("✅ Utilisateur mis à jour !");
}
async function actualiserDashboard() {
    var total = donneesCloud.length;
    var el = function(id){ return document.getElementById(id); };
    if (el('dashTotal')) el('dashTotal').textContent = total.toLocaleString('fr-FR');
    if (el('dashStar')) el('dashStar').textContent = donneesCloud.filter(function(t){return t.jeu==='Star';}).length;
    if (el('dashFortune')) el('dashFortune').textContent = donneesCloud.filter(function(t){return t.jeu==='Fortune';}).length;
    if (el('dashDigital')) el('dashDigital').textContent = donneesCloud.filter(function(t){return t.jeu==='Digital';}).length;
    if (total > 0 && el('dashDerniereDate')) {
        var dd = donneesCloud.reduce(function(max,t){return t.date>max?t.date:max;}, donneesCloud[0].date);
        el('dashDerniereDate').textContent = new Date(dd).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
    }
}
function exporterSauvegardeComplete() {
    if (!estAdmin) { alert("Action réservée aux administrateurs."); return; }
    if (donneesCloud.length === 0) { alert("Aucune donnée à exporter."); return; }
    var l = ["date,heure,jeu,boules"];
    donneesCloud.forEach(function(t){ l.push([t.date, t.heure, t.jeu, '"' + t.boules.join(",") + '"'].join(",")); });
    var blob = new Blob([l.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "loto-benin-sauvegarde-" + new Date().toISOString().slice(0,10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
}
function chargerUtilisateursDansTableau() {
    if (typeof chargerUtilisateursAuto === 'function') chargerUtilisateursAuto();
}

// ============================================================
// 17. IMPORTATION (complet d'origine)
// ============================================================
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
    var txt = document.getElementById("texteAImporter").value, msg = document.getElementById("importMessage");
    if (!txt.trim()) { msg.textContent = "Vide."; return; }
    msg.textContent = "Analyse...";
    var lignes = txt.split(/\r?\n/), nv = [], cf = [], inv = 0, aA = new Date().getFullYear(), aMax = aA+1, aMin = 2004;
    lignes.forEach(function(l) {
        if (!l.trim()) return;
        var ll = l.toLowerCase();
        if (ll.indexOf("date")!==-1 || ll.indexOf("column")!==-1 || ll.indexOf("benin")!==-1) return;
        var d = parseDateExotique(l); if (!d) { inv++; return; }
        if (d.jour<1||d.jour>31||d.mois<1||d.mois>12||d.annee<aMin||d.annee>aMax) { inv++; return; }
        var df = d.annee + "-" + String(d.mois).padStart(2,'0') + "-" + String(d.jour).padStart(2,'0');
        var jt = "Star", ht = "14H";
        if (ll.indexOf("digital")!==-1) jt = "Digital";
        else if (ll.indexOf("fortune")!==-1) jt = "Fortune";
        else if (/\b(jeu|ven|lun|mar)\b/i.test(l)) jt = "Fortune";
        var mh = l.match(/(\d{1,2})\s*[hH]/); if (mh) ht = mh[1].padStart(2,'0') + "H";
        var tn = l.replace(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/, ' ').replace(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, ' ').replace(/\d{1,2}(?:er)?\s+[a-zéèûôàç]+\.?\s+\d{2,4}/i, ' ').replace(/\b\d{1,2}\s*[hH]\b/g, ' ').replace(/star|fortune|digital|\b(jeu|ven|lun|mar|mer|sam|dom)\b/gi, ' ');
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
    if (nv.length === 0 && cf.length === 0) { msg.textContent = "⚠️ Aucun valide (" + inv + " invalides)."; return; }
    importAttente = { nouveaux: nv, conflits: cf, invalides: inv };
    var modal = document.getElementById("modalConflitImport");
    if (!modal) {
        var resume = "📥 Résumé :\n" + nv.length + " nouveaux\n" + cf.length + " conflits\n" + inv + " invalides.\n\n";
        if (cf.length > 0) {
            if (confirm(resume + "Voulez-vous écraser les anciens ?")) executerImport('ecraser');
            else executerImport('ignorer');
        } else { alert(resume + "Ajout en cours..."); executerImport('ignorer'); }
        return;
    }
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
    msg.textContent = "En attente de votre choix.";
}
async function executerImport(mode) {
    if (!importAttente) return;
    var msg = document.getElementById("messageConflit"), mp = document.getElementById("importMessage");
    msg.textContent = "⏳...";
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
    if (err) { msg.textContent = "❌ " + err.message; document.querySelectorAll("#modalConflitImport button").forEach(function(b){ b.disabled = false; }); return; }
    var res2 = "✅ Terminé. " + nbA + " ajouté(s)" + (mode==='ecraser' ? ", " + nbE + " écrasé(s)" : ", " + nbI + " ignoré(s)") + ".";
    msg.textContent = res2; mp.textContent = res2;
    importAttente = null;
    document.getElementById("texteAImporter").value = "";
    setTimeout(function(){ document.getElementById("modalConflitImport").style.display = "none"; chargerDonnees(true); }, 1500);
}
function annulerImport() {
    importAttente = null;
    document.getElementById("modalConflitImport").style.display = "none";
    document.getElementById("importMessage").textContent = "⏹️ Annulé.";
}

// ============================================================
// 18. TAILLE DES BOULES
// ============================================================
function changerTailleBoules(t) { localStorage.setItem('loto_taille_boules', t); document.body.className = t; }

// ============================================================
// 19. EXPOSITION GLOBALE
// ============================================================
window.ouvrirDrawer = ouvrirDrawer;
window.fermerDrawer = fermerDrawer;
window.seDeconnecterDepuisDrawer = seDeconnecterDepuisDrawer;
window.retirerAtelier = retirerAtelier;
window.ouvrirOnglet = ouvrirOnglet;
window.ouvrirOngletDepuisDrawer = ouvrirOngletDepuisDrawer;

window.verifierSession = verifierSession;
window.seConnecter = seConnecter;
window.entrerVisiteur = entrerVisiteur;
window.seDeconnecter = seDeconnecter;
window.afficherConnexion = afficherConnexion;
window.afficherInscription = afficherInscription;
window.afficherApplication = afficherApplication;

window.chargerDonnees = chargerDonnees;
window.afficherSacSelectionne = afficherSacSelectionne;

window.actualiserCockpit = actualiserCockpit;
window.genererGrilleCockpit = genererGrilleCockpit;

window.executerAnalyses = executerAnalyses;
window.initialiserRecherche = initialiserRecherche;
window.ajouterChampRecherche = ajouterChampRecherche;
window.retirerChampRecherche = retirerChampRecherche;
window.changerModeRecherche = changerModeRecherche;
window.executerRecherche = executerRecherche;

window.remplirBoulesGrid = remplirBoulesGrid;
window.afficherDetailBoule = afficherDetailBoule;

window.ajouterPlage = ajouterPlage;
window.supprimerPlage = supprimerPlage;
window.executerComparateurMulti = executerComparateurMulti;
window.mettreAJourZoneComparaison = mettreAJourZoneComparaison;
window.retirerDuComparateur = retirerDuComparateur;
window.viderZoneComparaison = viderZoneComparaison;

window.remplirSelecteursLabo = remplirSelecteursLabo;
window.analyserTirageLabo = analyserTirageLabo;
window.faireTurning = faireTurning;
window.faireAddition = faireAddition;
window.faireTheosophie = faireTheosophie;
window.chercherBanker = chercherBanker;
window.analyserSuivi = analyserSuivi;
window.traquerSomme = traquerSomme;
window.executerAdditions = executerAdditions;
window.executerBankersMulti = executerBankersMulti;

window.chargerUtilisateursAuto = chargerUtilisateursAuto;
window.sauvegarderPrivileges = sauvegarderPrivileges;
window.actualiserDashboard = actualiserDashboard;
window.exporterSauvegardeComplete = exporterSauvegardeComplete;
window.chargerUtilisateursDansTableau = chargerUtilisateursDansTableau;

window.traiterTexteColle = traiterTexteColle;
window.executerImport = executerImport;
window.annulerImport = annulerImport;

window.changerTailleBoules = changerTailleBoules;

console.log("✅ app.js — toutes les fonctions exposées globalement (version complète)");

// ============================================================
// 20. INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    var t = localStorage.getItem('loto_taille_boules') || 'taille-normale';
    document.body.className = t;
    if (document.getElementById("selectTailleBoules")) document.getElementById("selectTailleBoules").value = t;
    if(document.getElementById("date")) document.getElementById("date").valueAsDate = new Date();
    verifierSession();
});
