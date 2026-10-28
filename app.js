// ============================================================
// CACHE PERSISTANT + CHARGEMENT PROGRESSIF
// ============================================================
var CACHE_TTL_MS = 60000;              // 60s (les nouvelles données arrivent rarement)
var PAGE_SIZE_INITIAL = 200;            // tirages chargés en premier (interface rapide)
var PAGE_SIZE_BG = 1000;                // taille des pages en arrière-plan
var AFFICHAGE_LIMITE = 100;             // tirages affichés par défaut dans Compilation
var cacheTimestamp = 0;
var chargementEnCours = false;
var chargementComplet = false;           // true quand TOUT l'historique est en mémoire
var plusAncienCharge = null;
var totalAttendu = 0;                    // nombre total de tirages côté serveur

var LS_KEY_TIRAGES = 'loto_cache_tirages_v1';
var LS_KEY_TS = 'loto_cache_tirages_ts_v1';

// Recharge le cache depuis localStorage (au démarrage, instantané)
function restaurerCacheLocal() {
    try {
        var raw = localStorage.getItem(LS_KEY_TIRAGES);
        var ts = parseInt(localStorage.getItem(LS_KEY_TS) || '0', 10);
        if (raw && ts && (Date.now() - ts) < 24 * 3600 * 1000) { // cache valide 24h
            var arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
                donneesCloud = arr;
                plusAncienCharge = donneesCloud[0].date;
                cacheTimestamp = ts;
                // Si on a "beaucoup" de données en cache, on considère le chargement complet
                chargementComplet = arr.length >= 500;
                return true;
            }
        }
    } catch (e) { console.warn("restaurerCacheLocal:", e); }
    return false;
}

// Sauvegarde en localStorage (asynchrone "best effort")
function sauvegarderCacheLocal() {
    try {
        localStorage.setItem(LS_KEY_TIRAGES, JSON.stringify(donneesCloud));
        localStorage.setItem(LS_KEY_TS, String(Date.now()));
    } catch (e) {
        console.warn("sauvegarderCacheLocal (quota?):", e);
        // Si quota dépassé, on vide l'ancien cache
        try { localStorage.removeItem(LS_KEY_TIRAGES); } catch(_) {}
    }
}

// Met à jour le compteur visible
function majCompteurChargement(charge, total) {
    var statusEl = document.getElementById("statusCloud");
    if (!statusEl) return;
    if (chargementComplet) {
        statusEl.textContent = "✅ " + charge + " tirages (historique complet)";
    } else if (total > 0) {
        statusEl.textContent = "⏳ " + charge + " / " + total + " tirages...";
    } else {
        statusEl.textContent = "⏳ " + charge + " tirages...";
    }
}

// ============================================================
// CHARGEMENT PRINCIPAL (rapide puis en arrière-plan)
// ============================================================
async function chargerDonnees(force) {
    var now = Date.now();

    // 1) Si cache local valide et pas de force → on l'utilise tel quel
    if (!force && donneesCloud.length > 0 && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return;
    }

    // 2) Tenter de restaurer depuis localStorage (instantané)
    if (!force && donneesCloud.length === 0) {
        if (restaurerCacheLocal()) {
            majCompteurChargement(donneesCloud.length, 0);
            afficherSacSelectionne();
            if (estAdmin) actualiserDashboard();
            // On lance quand même un refresh en arrière-plan pour récupérer les nouveaux
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
        // ÉTAPE 1 : le compte total (1 requête ultra légère)
        try {
            let { count } = await supabaseClient
                .from('tirages')
                .select('*', { count: 'exact', head: true });
            totalAttendu = count || 0;
        } catch (e) { totalAttendu = 0; }

        // ÉTAPE 2 : les PAGE_SIZE_INITIAL plus récents
        let { data, error } = await supabaseClient
            .from('tirages')
            .select('*')
            .order('date', { ascending: false })
            .order('heure', { ascending: false })
            .limit(PAGE_SIZE_INITIAL);

        if (error) throw error;

        donneesCloud = (data || []).map(function (item) {
            var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
            return {
                id: item.id, date: item.date, jeu: item.jeu, heure: item.heure,
                boules: arr, somme: arr.reduce(function (a, b) { return a + b; }, 0)
            };
        }).reverse();

        plusAncienCharge = donneesCloud.length > 0 ? donneesCloud[0].date : null;
        cacheTimestamp = now;
        majCompteurChargement(donneesCloud.length, totalAttendu);

        // Affichage immédiat (interface utilisable tout de suite)
        afficherSacSelectionne();
        if (estAdmin) actualiserDashboard();

        // ÉTAPE 3 : chargement du reste en arrière-plan (non bloquant)
        chargerResteEnArrierePlan();

    } catch (err) {
        console.error("chargerDonnees:", err);
        if (statusEl) statusEl.textContent = "❌ Erreur chargement";
    } finally {
        chargementEnCours = false;
    }
}

// Charge les pages plus anciennes en arrière-plan, sans bloquer l'UI
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
            if (!data || data.length === 0) {
                chargementComplet = true;
                break;
            }

            // Dédoublonnage par id (au cas où)
            var ids = new Set(donneesCloud.map(function (t) { return t.id; }));
            var nouveaux = data
                .filter(function (item) { return !ids.has(item.id); })
                .map(function (item) {
                    var arr = typeof item.boules === 'string' ? JSON.parse(item.boules) : item.boules;
                    return {
                        id: item.id, date: item.date, jeu: item.jeu, heure: item.heure,
                        boules: arr, somme: arr.reduce(function (a, b) { return a + b; }, 0)
                    };
                })
                .reverse();

            donneesCloud = nouveaux.concat(donneesCloud);
            plusAncienCharge = donneesCloud[0].date;

            majCompteurChargement(donneesCloud.length, totalAttendu);

            // Si la page a été plus petite que PAGE_SIZE_BG → on a fini
            if (data.length < PAGE_SIZE_BG) {
                chargementComplet = true;
            }

            // On rafraîchit l'affichage courant (léger différé)
            afficherSacSelectionne();
            if (estAdmin) actualiserDashboard();

            // Petite pause pour ne pas saturer le CPU/réseau
            await new Promise(function (r) { setTimeout(r, 100); });

        } catch (e) {
            console.warn("Erreur chargement background:", e);
            break;
        }
    }

    // Fin définitive : cache persistant + statut
    chargementComplet = true;
    cacheTimestamp = Date.now();
    sauvegarderCacheLocal();
    majCompteurChargement(donneesCloud.length, totalAttendu);
}

// (Optionnel) Bouton "recharger depuis le serveur"
async function forcerRechargementComplet() {
    chargementComplet = false;
    donneesCloud = [];
    plusAncienCharge = null;
    cacheTimestamp = 0;
    try { localStorage.removeItem(LS_KEY_TIRAGES); } catch(_) {}
    await chargerDonnees(true);
}

// ============================================================
// AFFICHAGE COMPILATION — VERSION OPTIMISÉE
// ============================================================
function afficherSacSelectionne() {
    var sacId = document.getElementById("selectSac").value, filtre = document.getElementById("filtrePeriode").value;
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

    // Les plus récents d'abord, puis on tronque à AFFICHAGE_LIMITE
    var tfAffiches = tf.slice(-AFFICHAGE_LIMITE).reverse();

    var parDate = {};
    tfAffiches.forEach(function (t) {
        if (!parDate[t.date]) parDate[t.date] = [];
        parDate[t.date].push(t);
    });

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

            var time = document.createElement('div');
            time.className = 'day-time';
            time.textContent = t.heure;

            var game = document.createElement('div');
            game.className = 'day-game';
            game.textContent = t.jeu;

            var nums = document.createElement('div');
            nums.className = 'day-nums';
            t.boules.forEach(function (b) {
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

    // Message d'info + bouton "Afficher plus" si tronqué
    if (tf.length > AFFICHAGE_LIMITE) {
        var info = document.createElement('p');
        info.style.cssText = "text-align:center; color:#888; margin-top:10px; font-size:13px;";
        info.textContent = "Affichage des " + AFFICHAGE_LIMITE + " plus récents sur " + tf.length + " au total.";
        conteneur.appendChild(info);

        var btn = document.createElement('button');
        btn.textContent = "⬇️ Afficher 100 de plus";
        btn.style.cssText = "margin:10px auto; display:block; padding:10px 20px; background:#3498db; color:#fff; border:none; border-radius:8px; cursor:pointer;";
        btn.onclick = function () {
            AFFICHAGE_LIMITE += 100;
            afficherSacSelectionne();
        };
        conteneur.appendChild(btn);
    }

    // Bandeau "chargement en cours" si l'historique n'est pas complet
    if (!chargementComplet) {
        var bandeau = document.createElement('div');
        bandeau.style.cssText = "text-align:center; padding:8px; background:#fff3cd; color:#856404; border-radius:6px; margin-top:10px; font-size:13px;";
        bandeau.textContent = "⏳ Historique en cours de chargement en arrière-plan (" + donneesCloud.length + (totalAttendu ? " / " + totalAttendu : "") + ")...";
        conteneur.appendChild(bandeau);
    }
}

// ============================================================
// BOUTON AJOUTER — VERSION OPTIMISÉE (avec invalidation cache)
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

    let { data, error } = await supabaseClient
        .from('tirages')
        .insert([{ date: date, jeu: jeu, heure: heure, boules: JSON.stringify(boules), numero_tirage: "Auto" }])
        .select()
        .single();

    if (error) { msg.textContent = "❌ Erreur"; return; }

    msg.textContent = "✅ Enregistré !";
    for (var j = 1; j <= 5; j++) document.getElementById("b" + j).value = "";

    // On ajoute localement avec la vraie ligne renvoyée par Supabase
    var nouveauTirage = {
        id: data.id,
        date: data.date,
        jeu: data.jeu,
        heure: data.heure,
        boules: typeof data.boules === 'string' ? JSON.parse(data.boules) : data.boules,
        somme: boules.reduce(function (a, b) { return a + b; }, 0)
    };

    // Vérif doublon (au cas où)
    if (!donneesCloud.some(function (t) { return t.id === nouveauTirage.id; })) {
        donneesCloud.push(nouveauTirage);
        donneesCloud.sort(function (a, b) {
            return a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure);
        });
    }

    // Mise à jour totale attendue
    totalAttendu = Math.max(totalAttendu, donneesCloud.length);

    // Cache invalidé + sauvegardé
    cacheTimestamp = Date.now();
    sauvegarderCacheLocal();

    document.getElementById("filtrePeriode").value = "tout";
    afficherSacSelectionne();
    actualiserDashboard();
});
