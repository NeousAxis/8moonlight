// --- Plateforme native (Capacitor) ---
// En environnement natif iOS, le wrapper WKWebView ne gère pas l'API Web Notification
// ni les téléchargements de blob. On route donc géolocalisation, notifications et export
// calendrier vers les plugins Capacitor natifs. Sur le web, le comportement PWA d'origine
// est conservé tel quel.
const Cap = window.Capacitor;
const IS_NATIVE = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
const NativePlugins = (Cap && Cap.Plugins) ? Cap.Plugins : {};

// Récupère une position de façon unifiée (Capacitor Geolocation en natif, navigator sinon).
async function getPositionUnified() {
    if (IS_NATIVE && NativePlugins.Geolocation) {
        try { await NativePlugins.Geolocation.requestPermissions(); } catch (e) { /* ignore */ }
        return NativePlugins.Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
    }
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) { reject(new Error('no-geolocation')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });
}

// Vrai si les notifications sont autorisées (LocalNotifications en natif, Notification sinon).
async function notifGranted() {
    if (IS_NATIVE && NativePlugins.LocalNotifications) {
        try { const s = await NativePlugins.LocalNotifications.checkPermissions(); return s.display === 'granted'; }
        catch (e) { return false; }
    }
    return ('Notification' in window) && Notification.permission === 'granted';
}

// Identifiant entier stable dérivé d'un tag (requis par LocalNotifications).
function tagToId(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) { h = (Math.imul(h, 31) + tag.charCodeAt(i)) | 0; }
    return (Math.abs(h) % 2000000000) + 1;
}

// --- State (Persisté via localStorage) ---
let state = {
    lat: null,
    lon: null,
    city: "",
    country: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hasLocation: false, // FLAG pour savoir si la localisation est confirmée
    isManual: false // FLAG pour savoir si l'utilisateur a saisi manuellement la ville
};

function loadState() {
    const saved = localStorage.getItem('moonlight_state');
    if (saved) {
        state = JSON.parse(saved);
    }
}

function saveState() {
    localStorage.setItem('moonlight_state', JSON.stringify(state));
}

loadState();

// DOM Elements
const els = {
    phaseName: document.getElementById('phaseName'),
    illuminationText: document.getElementById('illuminationText'),
    progressFill: document.getElementById('progressFill'),
    progressMarker: document.getElementById('progressMarker'),
    moonPath: document.getElementById('moon-path'),
    nextNewDate: document.getElementById('nextNewDate'),
    nextNewCountdown: document.getElementById('nextNewCountdown'),
    nextFullDate: document.getElementById('nextFullDate'),
    nextFullCountdown: document.getElementById('nextFullCountdown'),
    moonRise: document.getElementById('moonRise'),
    moonSet: document.getElementById('moonSet'),
    moonAge: document.getElementById('moonAge'),
    nextPhaseName: document.getElementById('nextPhaseName'),
    upcomingPhasesList: document.getElementById('upcomingPhasesList'),
    widgetMoonIcon: document.getElementById('widget-moon-icon'),
    widgetIllum: document.getElementById('widget-illum'),
    widgetCountdown: document.getElementById('widget-countdown'),
    headerCity: document.getElementById('headerCity'),
    headerCountry: document.getElementById('headerCountry'),
    inputCity: document.getElementById('inputCity'),
    inputCountry: document.getElementById('inputCountry'),
    gpsStatus: document.getElementById('gpsStatus'),
    gardenIcon: document.getElementById('gardenIcon'),
    gardenType: document.getElementById('gardenType'),
    gardenAction: document.getElementById('gardenAction'),
    moodText: document.getElementById('moodText'),
    seasonalText: document.getElementById('seasonalText'),
    seasonalTitle: document.getElementById('seasonalTitle')
};

// --- Constants ---
const SYNODIC_MONTH = 29.53058867;
const REFERENCE_NEW_MOON = new Date('2000-01-06T12:24:00Z');

// --- Gardening & Mood Logic ---
const GARDEN_ADVICE = {
    root: { icon: "🥕", type: "Jour Racine", action: "Idéal pour semer/récolter carottes, radis, oignons..." },
    leaf: { icon: "🥬", type: "Jour Feuille", action: "Occupez-vous des salades, épinards, herbes..." },
    flower: { icon: "🌸", type: "Jour Fleur", action: "Bon pour les fleurs et légumes-fleurs (brocolis)." },
    fruit: { icon: "🍅", type: "Jour Fruit", action: "Semis et récolte de tomates, haricots, petits fruits." },
    rest: { icon: "⛔", type: "Repos", action: "La lune est défavorable (nœud lunaire/apogée/périgée). Reposez-vous." }
};

const MOOD_ADVICE = {
    waxing: [ // Croissant
        "⚡️ Énergie montante. Lancez de nouveaux projets.",
        "💡 Votre intuition est affûtée. Écoutez-la.",
        "🤝 Bon moment pour les rencontres et la communication.",
        "🚀 Action ! C'est le moment de passer à l'étape supérieure."
    ],
    waning: [ // Décroissant
        "🧹 Phase de nettoyage. Triez, rangez, jetez.",
        "🧘‍♀️ Ralentissez. C'est un temps pour l'introspection.",
        "🔋 Rechargez vos batteries. Ne commencez rien de grand.",
        "🍂 Lâcher-prise. Acceptez ce qui se termine."
    ],
    new: "🌑 Nouvelle Lune : Posez vos intentions pour le cycle à venir.",
    full: "🌕 Pleine Lune : Émotions intenses. Célébrez vos accomplissements."
};

const SEASON_DATA = {
    0: { fruits: "Pomme, Poire, Clémentine, Kiwi", veggies: "Poireau, Chou, Carotte, Endive" }, // Jan
    1: { fruits: "Pomme, Poire, Kiwi, Mandarine", veggies: "Poireau, Épinard, Chou, Carotte" }, // Fév
    2: { fruits: "Pomme, Kiwi, Citron", veggies: "Asperge, Épinard, Radis, Poireau" }, // Mars
    3: { fruits: "Pomme, Rhubarbe", veggies: "Asperge, Artichaut, Petit pois, Radis" }, // Avril
    4: { fruits: "Fraise, Rhubarbe", veggies: "Asperge, Artichaut, Fève, Petit pois" }, // Mai
    5: { fruits: "Fraise, Cerise, Framboise, Melon", veggies: "Courgette, Haricot vert, Tomate, Poivron" }, // Juin
    6: { fruits: "Pêche, Abricot, Melon, Prune", veggies: "Tomate, Aubergine, Courgette, Concombre" }, // Juil
    7: { fruits: "Pêche, Mirabelle, Figue, Melon", veggies: "Tomate, Aubergine, Poivron, Courgette" }, // Août
    8: { fruits: "Raisin, Figue, Poire, Pomme", veggies: "Potiron, Champignon, Poireau, Brocoli" }, // Sept
    9: { fruits: "Raisin, Coing, Pomme, Poire", veggies: "Courge, Châtaigne, Épinard, Champignon" }, // Oct
    10: { fruits: "Pomme, Poire, Clémentine, Kaki", veggies: "Courge, Poireau, Endive, Chou" }, // Nov
    11: { fruits: "Pomme, Poire, Clémentine, Kiwi", veggies: "Endive, Courge, Poireau, Chou" } // Déc
};

const SEASON_DATA_TROPICAL = {
    fruits: "Mangue, Banane, Fruit de la passion, Pomélo, Goyave",
    veggies: "Liseron d'eau, Pakchoi, Bambou, Patate douce, Concombre"
};

function getSeasonalItems() {
    const month = new Date().getMonth();
    const isTropical = (state.country && state.country.toLowerCase().includes("vietnam")) ||
        (state.timezone && state.timezone.includes("Asia/Ho_Chi_Minh"));

    if (isTropical) {
        return SEASON_DATA_TROPICAL;
    }
    return SEASON_DATA[month];
}

function getGardenMood(age, phaseFraction, targetDate = new Date()) {
    // Simplification pour l'algo jardinage (basé sur la position approx. dans le zodiaque lunaire via l'âge)
    // C'est une approximation cyclique.
    // Cycle sidéral ~27.3 jours. Zodiaque divisé en 4 trigones.
    // Racine (Terre), Feuille (Eau), Fleur (Air), Fruit (Feu).
    const sideralDay = (age / 27.32) * 27.32; // position approximative

    // Cycle artificiel pour démo (change tous les ~2-3 jours)
    let gardenKey = 'leaf';
    const trigone = Math.floor(sideralDay / 2.3) % 4; // change tous les 2.3 jours

    if (trigone === 0) gardenKey = 'root';
    else if (trigone === 1) gardenKey = 'flower'; // Air ~ Fleur
    else if (trigone === 2) gardenKey = 'leaf';  // Eau ~ Feuille
    else gardenKey = 'fruit';

    // Gestion Nœuds lunaires (Repos) - Simulation simple (tous les 14 jours)
    if (Math.abs(age - 13.5) < 0.5 || Math.abs(age - 27) < 0.5) gardenKey = 'rest';

    // Mood
    let mood = "";
    if (phaseFraction < 0.02 || phaseFraction > 0.98) mood = MOOD_ADVICE.new;
    else if (phaseFraction > 0.48 && phaseFraction < 0.52) mood = MOOD_ADVICE.full;
    else {
        const list = (phaseFraction < 0.5) ? MOOD_ADVICE.waxing : MOOD_ADVICE.waning;
        // Choix du message basé sur le jour du mois pour qu'il reste fixe toute la journée
        const targetIndex = targetDate.getDate() % list.length;
        mood = list[targetIndex];
    }

    return { garden: GARDEN_ADVICE[gardenKey], mood };
}

// --- Astronomical Logic ---

function getMoonData(date, timezone) {
    const diffTime = date.getTime() - REFERENCE_NEW_MOON.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    const age = diffDays % SYNODIC_MONTH;
    if (age < 0) age += SYNODIC_MONTH;
    const phaseFraction = age / SYNODIC_MONTH;
    const illumination = 0.5 * (1 - Math.cos(2 * Math.PI * phaseFraction));

    let phaseName = "";
    if (phaseFraction < 0.02 || phaseFraction > 0.98) phaseName = "Nouvelle Lune";
    else if (phaseFraction < 0.24) phaseName = "Premier croissant";
    else if (phaseFraction < 0.26) phaseName = "Premier quartier";
    else if (phaseFraction < 0.49) phaseName = "Gibbeuse croissante";
    else if (phaseFraction < 0.51) phaseName = "Pleine Lune";
    else if (phaseFraction < 0.74) phaseName = "Gibbeuse décroissante";
    else if (phaseFraction < 0.76) phaseName = "Dernier quartier";
    else phaseName = "Dernier croissant";

    return { age, phaseFraction, illumination, phaseName };
}

function getNextPhaseDate(targetPhaseFraction, startDate) {
    const currentData = getMoonData(startDate);
    let daysToAdd = 0;
    if (targetPhaseFraction > currentData.phaseFraction) {
        daysToAdd = (targetPhaseFraction - currentData.phaseFraction) * SYNODIC_MONTH;
    } else {
        daysToAdd = (1 - currentData.phaseFraction + targetPhaseFraction) * SYNODIC_MONTH;
    }
    const nextDate = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return nextDate;
}

function drawMoon(phaseFraction, hemisphere) {
    const isNorth = hemisphere === 'N';
    const r = 48, cx = 50, cy = 50;
    let d = "";

    if (phaseFraction < 0.01 || phaseFraction > 0.99) { 
        d = ""; 
    }
    else if (phaseFraction > 0.49 && phaseFraction < 0.51) { 
        d = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
    } else {
        let termRx = Math.abs(Math.cos(phaseFraction * 2 * Math.PI)) * r;
        if (termRx < 0.1) termRx = 0.1; // Eviter les bugs de rendu avec rx=0

        let sweepTerm = 0;
        let lightSideRight = false;

        if (isNorth) {
            lightSideRight = phaseFraction < 0.5;
            sweepTerm = (phaseFraction < 0.25 || (phaseFraction >= 0.5 && phaseFraction < 0.75)) ? 0 : 1;
        } else {
            lightSideRight = phaseFraction >= 0.5;
            sweepTerm = (phaseFraction < 0.25 || (phaseFraction >= 0.5 && phaseFraction < 0.75)) ? 1 : 0;
        }

        if (lightSideRight) {
            d += `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`;
            d += ` A ${termRx} ${r} 0 0 ${sweepTerm} ${cx} ${cy - r}`;
        } else {
            d += `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r}`;
            d += ` A ${termRx} ${r} 0 0 ${sweepTerm} ${cx} ${cy - r}`;
        }
    }
    
    if (els.moonPath) {
        els.moonPath.setAttribute('d', d);
    }
}

// --- Formatting Helpers ---

function formatLocal(date, tz) {
    return date.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}
function formatDateLocal(date, tz) {
    return date.toLocaleDateString('fr-FR', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
}

// --- App Update Logic ---

function updateApp() {
    const now = new Date();
    const tz = state.timezone;
    // Déduction Hémisphère via latitude GPS
    const hemisphere = state.lat >= 0 ? 'N' : 'S';

    const data = getMoonData(now);

    // 1. Text
    els.phaseName.textContent = data.phaseName;
    els.illuminationText.textContent = `${Math.round(data.illumination * 100)}% d'illumination`;
    els.moonAge.textContent = `${data.age.toFixed(1)} jours`;

    // Display: Priorité au state utilisateur, sinon fallback générique
    els.headerCity.textContent = state.city || "Ville";
    els.headerCountry.textContent = state.country || "Pays";

    // 2. Visual
    drawMoon(data.phaseFraction, hemisphere);

    // 3. Progress
    const pct = (data.phaseFraction * 100).toFixed(1);
    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressMarker) els.progressMarker.style.left = `${pct}%`;

    // 4. Input Sync (pour garder les champs à jour avec le state)
    if (els.inputCity && document.activeElement !== els.inputCity) els.inputCity.value = state.city || "";
    if (els.inputCountry && document.activeElement !== els.inputCountry) els.inputCountry.value = state.country || "";

    // 5. Next Phases
    const nextNew = getNextPhaseDate(0, now);
    const nextFull = getNextPhaseDate(0.5, now);

    els.nextNewDate.textContent = `${formatDateLocal(nextNew, tz)} • ${formatLocal(nextNew, tz)}`;
    els.nextFullDate.textContent = `${formatDateLocal(nextFull, tz)} • ${formatLocal(nextFull, tz)}`;

    // Countdowns
    const diffNew = nextNew - now;
    const diffFull = nextFull - now;
    const daysN = Math.floor(diffNew / (1000 * 60 * 60 * 24));
    const hrsN = Math.floor((diffNew % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const daysF = Math.floor(diffFull / (1000 * 60 * 60 * 24));
    const hrsF = Math.floor((diffFull % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    els.nextNewCountdown.textContent = `Dans ${daysN}j ${hrsN}h`;
    els.nextFullCountdown.textContent = `Dans ${daysF}j ${hrsF}h`;

    // Réordonner les cartes pour que l'événement le plus proche soit en premier
    const cardNew = document.getElementById('cardNewMoon');
    const cardFull = document.getElementById('cardFullMoon');
    if (cardNew && cardFull && cardNew.parentNode) {
        if (diffFull < diffNew) {
            // Pleine Lune plus proche, la mettre en premier
            cardNew.parentNode.insertBefore(cardFull, cardNew);
        } else {
            // Nouvelle Lune plus proche, la mettre en premier
            cardNew.parentNode.insertBefore(cardNew, cardFull);
        }
    }

    // Detail View
    els.moonRise.textContent = "06:" + Math.floor(6 + (data.age / SYNODIC_MONTH) * 24 % 24).toString().padStart(2, '0'); // Approx
    els.moonSet.textContent = "18:" + Math.floor(18 + (data.age / SYNODIC_MONTH) * 24 % 24).toString().padStart(2, '0'); // Approx

    // --- NEW: Garden & Mood Logic (UNIQUEMENT si localisation confirmée) ---
    if (state.hasLocation && els.gardenIcon) {
        const extra = getGardenMood(data.age, data.phaseFraction, now);

        els.gardenIcon.textContent = extra.garden.icon;
        els.gardenType.textContent = extra.garden.type;
        els.gardenAction.textContent = extra.garden.action;
        els.moodText.textContent = extra.mood;

        const seasonal = getSeasonalItems();
        els.seasonalText.innerHTML = `🥗 <strong>Légumes:</strong> ${seasonal.veggies}<br>🍎 <strong>Fruits:</strong> ${seasonal.fruits}`;

        const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date());
        if (els.seasonalTitle) els.seasonalTitle.textContent = `De saison (${monthName})`;
    } else if (els.gardenIcon) {
        // Pas de localisation, on affiche un message d'invitation
        els.gardenIcon.textContent = "🌍";
        els.gardenType.textContent = "Localisation requise";
        els.gardenAction.textContent = "Rendez-vous dans Réglages pour indiquer votre position.";
        els.moodText.textContent = "Indiquez votre localisation pour obtenir un conseil.";
        els.seasonalText.textContent = "Indiquez votre localisation pour voir les produits de saison.";
        if (els.seasonalTitle) els.seasonalTitle.textContent = "De saison";
    }

    if (diffNew < diffFull) {
        els.nextPhaseName.textContent = `Nouvelle Lune (${formatLocal(nextNew, tz)})`;
        els.widgetCountdown.textContent = `J-${daysN} Nouvelle Lune`;
    } else {
        els.nextPhaseName.textContent = `Pleine Lune (${formatLocal(nextFull, tz)})`;
        els.widgetCountdown.textContent = `J-${daysF} Pleine Lune`;
    }

    generateUpcomingList(now, tz);
    els.widgetIllum.textContent = `${Math.round(data.illumination * 100)}%`;
    els.widgetMoonIcon.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="50" r="48" fill="#333"/><path fill="white" d="${els.moonPath.getAttribute('d')}"/></svg>`;
}

function generateUpcomingList(now, tz) {
    els.upcomingPhasesList.innerHTML = '';
    let nextNew = getNextPhaseDate(0, now);
    let nextFull = getNextPhaseDate(0.5, now);
    let phases = [];

    if (nextFull < nextNew) {
        for (let i = 0; i < 6; i++) {
            let d = new Date(nextFull.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Pleine Lune" : "Nouvelle Lune" });
        }
    } else {
        for (let i = 0; i < 6; i++) {
            let d = new Date(nextNew.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Nouvelle Lune" : "Pleine Lune" });
        }
    }

    phases.forEach(p => {
        const div = document.createElement('div');
        div.className = 'phase-item';
        div.innerHTML = `
            <div class="phase-icon">${p.type === 'Pleine Lune' ? '●' : '○'}</div>
            <div class="phase-info">
                <div class="phase-date">${p.type}</div>
                <div class="phase-time">${formatDateLocal(p.date, tz)} • ${formatLocal(p.date, tz)}</div>
            </div>`;
        els.upcomingPhasesList.appendChild(div);
    });
}

// --- Settings Logic (Inputs + GPS) ---

// Mise à jour de l'état quand l'utilisateur tape dans les champs
els.inputCity.addEventListener('input', (e) => {
    state.city = e.target.value;
    state.isManual = (state.city !== "");
    saveState();
    updateApp();
});

els.inputCountry.addEventListener('input', (e) => {
    state.country = e.target.value;
    state.isManual = (state.city !== "" || state.country !== "");
    saveState();
    updateApp();
});

// Logique GPS
document.getElementById('btnGps').addEventListener('click', async () => {
    els.gpsStatus.textContent = "Recherche du signal...";
    let pos;
    try {
        pos = await getPositionUnified();
    } catch (e) {
        els.gpsStatus.textContent = "Erreur GPS / Refus permission.";
        els.gpsStatus.style.color = "red";
        return;
    }

    state.lat = pos.coords.latitude;
    state.lon = pos.coords.longitude;
    state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    state.hasLocation = true;

    els.gpsStatus.textContent = "Recherche du nom de la ville...";
    els.gpsStatus.style.color = "var(--accent)";
    state.isManual = false;

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.lat}&lon=${state.lon}&accept-language=fr`);
        const data = await res.json();
        if (data && data.address) {
            const addr = data.address;
            let cityName = addr.city || addr.town || addr.state || addr.province || addr.municipality || addr.village || "Position GPS";
            if (cityName.includes("Phường") || cityName.includes("Huyện")) {
                cityName = addr.state || addr.province || cityName;
            }
            state.city = cityName;
            state.country = addr.country || "";
            els.gpsStatus.textContent = `Position : ${state.city}`;
        } else {
            els.gpsStatus.textContent = "Position trouvée !";
        }
    } catch (e) {
        els.gpsStatus.textContent = "Position trouvée !";
    }
    saveState();
    updateApp();
});

// Navigation & Toggles
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(item.getAttribute('data-target')).classList.add('active');
    });
});


// --- Toggle Persistence ---
const uiToggles = {
    fullMoon: document.getElementById('toggleFullMoon'),
    newMoon: document.getElementById('toggleNewMoon'),
    rem3d: document.getElementById('toggleRem3d'),
    rem1d: document.getElementById('toggleRem1d'),
    remDay: document.getElementById('toggleRemDay'),
    phaseAnnonce: document.getElementById('togglePhaseAnnonce')
};

let notificationSettings = {
    enabled: false, // interrupteur maître : les rappels sont actifs ou non
    fullMoon: true,
    newMoon: false,
    rem3d: false,
    rem1d: false,
    remDay: true,
    phaseAnnonce: false
};

// Load saved toggle states
function loadToggleStates() {
    const saved = localStorage.getItem('moonlight_toggles');
    if (saved) {
        // Fallback for previous structure
        const parsed = JSON.parse(saved);
        notificationSettings = { ...notificationSettings, ...parsed };
    }
    for (const [key, element] of Object.entries(uiToggles)) {
        if (element) {
            if (notificationSettings[key]) {
                element.classList.add('on');
            } else {
                element.classList.remove('on');
            }
        }
    }
}

// Save toggle states
function saveToggleStates() {
    for (const [key, element] of Object.entries(uiToggles)) {
        if (element) {
            notificationSettings[key] = element.classList.contains('on');
        }
    }
    localStorage.setItem('moonlight_toggles', JSON.stringify(notificationSettings));
    scheduleAllNotifications();
}

// Initialize toggles from localStorage
loadToggleStates();

// Add click handlers with persistence
document.querySelectorAll('.toggle-switch').forEach(t => {
    t.addEventListener('click', () => {
        t.classList.toggle('on');
        saveToggleStates();
    });
});

// --- Notifications Logic ---

const btnRequestNotifications = document.getElementById('btnRequestNotifications');
if (btnRequestNotifications) {
    const notifBtnLabel = document.getElementById('notifBtnLabel');
    const setNotifLabel = (txt) => { if (notifBtnLabel) notifBtnLabel.textContent = txt; };

    // Le bouton est un VRAI interrupteur : « Activer » (bleu) ou « Désactiver » (gris).
    const renderNotifButton = () => {
        if (notificationSettings.enabled) {
            setNotifLabel('Désactiver les rappels');
            btnRequestNotifications.style.background = 'rgba(255,255,255,0.12)';
            btnRequestNotifications.style.boxShadow = 'none';
        } else {
            setNotifLabel('Activer les rappels automatiques');
            btnRequestNotifications.style.background = '#2f6bff';
            btnRequestNotifications.style.boxShadow = '0 6px 22px rgba(47,107,255,0.45)';
        }
    };
    renderNotifButton();

    btnRequestNotifications.addEventListener('click', async () => {
        // --- DÉSACTIVER ---
        if (notificationSettings.enabled) {
            notificationSettings.enabled = false;
            localStorage.setItem('moonlight_toggles', JSON.stringify(notificationSettings));
            await cancelAllScheduled();
            renderNotifButton();
            return;
        }

        // --- ACTIVER --- (demande la permission si besoin)
        let granted = await notifGranted();
        if (!granted) {
            if (IS_NATIVE && NativePlugins.LocalNotifications) {
                try {
                    const r = await NativePlugins.LocalNotifications.requestPermissions();
                    granted = r.display === 'granted';
                } catch (e) { granted = false; }
            } else if ('Notification' in window) {
                granted = (await Notification.requestPermission()) === 'granted';
            } else {
                alert("Les notifications ne sont pas supportées par ce navigateur.");
                return;
            }
        }
        if (!granted) {
            alert("Notifications désactivées au niveau du système. Pour les activer : Réglages iOS › Moonlight › Notifications.");
            return;
        }
        notificationSettings.enabled = true;
        localStorage.setItem('moonlight_toggles', JSON.stringify(notificationSettings));
        renderNotifButton();
        scheduleAllNotifications();
        // Confirmation immédiate : l'utilisateur voit qu'une notification arrive vraiment.
        scheduleNotification('Rappels activés 🌙', 'Vous serez prévenu avant chaque pleine et nouvelle lune.', new Date(Date.now() + 4000), 'moonlight-confirm');
    });
}

async function scheduleNotification(title, body, date, tag) {
    if (date.getTime() < Date.now()) return; // Passée

    // Natif : planification via LocalNotifications (se déclenche hors app).
    if (IS_NATIVE && NativePlugins.LocalNotifications) {
        try {
            await NativePlugins.LocalNotifications.schedule({
                notifications: [{
                    id: tagToId(tag),
                    title: title,
                    body: body,
                    schedule: { at: date, allowWhileIdle: true }
                }]
            });
        } catch (e) { console.log('[LN] schedule', e); }
        return;
    }

    // Web : Notification Triggers API (Chrome Android) ou repli setTimeout.
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;

    if ('showTrigger' in Notification.prototype) {
        registration.showNotification(title, {
            body: body,
            icon: '/icon-192.png',
            tag: tag,
            showTrigger: new TimestampTrigger(date.getTime())
        });
    } else {
        const delay = date.getTime() - Date.now();
        if (delay > 0 && delay < 86400000) {
            setTimeout(() => {
                registration.showNotification(title, {
                    body: body,
                    icon: '/icon-192.png',
                    tag: tag
                });
            }, delay);
        }
    }
}

// Annule toutes les notifications déjà planifiées (natif).
async function cancelAllScheduled() {
    if (IS_NATIVE && NativePlugins.LocalNotifications) {
        try {
            const pend = await NativePlugins.LocalNotifications.getPending();
            if (pend && pend.notifications && pend.notifications.length) {
                await NativePlugins.LocalNotifications.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
            }
        } catch (e) { /* ignore */ }
    }
}

async function scheduleAllNotifications() {
    // Interrupteur maître : si les rappels sont désactivés, ne rien planifier.
    if (!notificationSettings.enabled) { await cancelAllScheduled(); return; }
    if (!(await notifGranted())) return;

    // Purge les notifications déjà planifiées avant de reprogrammer (évite les doublons).
    await cancelAllScheduled();

    // Ferme toutes les notifications existantes qui seraient planifiées ?
    // L'API actuelle overwrite si on utilise le même tag.

    const now = new Date();
    let nextNew = getNextPhaseDate(0, now);
    let nextFull = getNextPhaseDate(0.5, now);
    let phases = [];
    
    // Prochaines ~2 mois (4 événements majeurs)
    if (nextFull < nextNew) {
        for (let i = 0; i < 4; i++) {
            let d = new Date(nextFull.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Pleine Lune" : "Nouvelle Lune", targetFraction: i % 2 === 0 ? 0.5 : 0.0 });
        }
    } else {
        for (let i = 0; i < 4; i++) {
            let d = new Date(nextNew.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Nouvelle Lune" : "Pleine Lune", targetFraction: i % 2 === 0 ? 0.0 : 0.5 });
        }
    }

    // Calcul des rappels Pleine/Nouvelle Lune
    phases.forEach((p) => {
        let isFull = p.type === "Pleine Lune";
        let isNew = p.type === "Nouvelle Lune";
        
        if ((isFull && notificationSettings.fullMoon) || (isNew && notificationSettings.newMoon)) {
            const evtTime = p.date.getTime();
            const dateStr = p.date.toISOString().slice(0, 10);
            
            if (notificationSettings.rem3d) {
                const d3 = new Date(evtTime - 3 * 24 * 60 * 60 * 1000);
                scheduleNotification(`J-3 ${p.type}`, `Dans 3 jours, ce sera la ${p.type}. Préparez-vous !`, d3, `rem-3d-${dateStr}`);
            }
            if (notificationSettings.rem1d) {
                const d1 = new Date(evtTime - 1 * 24 * 60 * 60 * 1000);
                scheduleNotification(`J-1 ${p.type}`, `Demain, c'est la ${p.type}.`, d1, `rem-1d-${dateStr}`);
            }
            if (notificationSettings.remDay) {
                // 1h avant (avant minuit) / 8h avant (après minuit)
                const hour = p.date.getHours();
                let hoursBefore = (hour < 12) ? 8 : 1; 
                // "Après minuit" on considère < 12h (Matin). "Avant minuit" on considère >= 12h (Soir).
                
                const dDay = new Date(evtTime - hoursBefore * 60 * 60 * 1000);
                scheduleNotification(`H-${hoursBefore} ${p.type}`, `La ${p.type} aura lieu dans environ ${hoursBefore} heure(s).`, dDay, `rem-day-${dateStr}`);
            }
        }
    });

    // Annonces des phases & Énergie (toutes les phases: NL, PQ, PL, DQ)
    if (notificationSettings.phaseAnnonce) {
        const majorFractions = [0, 0.25, 0.5, 0.75];
        const fractionNames = {
            0: "Nouvelle Lune",
            0.25: "Premier Quartier",
            0.5: "Pleine Lune",
            0.75: "Dernier Quartier"
        };
        
        // Trouver la date des prochaines phases
        // On prend un point de départ et on cherche les prochaines occurences pour 2 mois
        let allPhases = [];
        for (let f of majorFractions) {
            let pDate = getNextPhaseDate(f, now);
            allPhases.push({ date: pDate, fraction: f, name: fractionNames[f] });
            let pDate2 = new Date(pDate.getTime() + SYNODIC_MONTH * 24 * 60 * 60 * 1000);
            allPhases.push({ date: pDate2, fraction: f, name: fractionNames[f] });
        }
        
        allPhases.forEach(p => {
            // "Les annonces des différentes phases... l'énergie du jour". 
            // On peut notifier à 09:00 le jour J pour annoncer l'énergie du jour de la phase.
            const notifyDate = new Date(p.date);
            notifyDate.setHours(9, 0, 0, 0);
            
            // Si l'heure limite est déjà passée aujourd'hui, on ne notifie pas
            if (notifyDate.getTime() < Date.now()) return;
            
            const dateStr = p.date.toISOString().slice(0, 10);
            const ageApprox = p.fraction * SYNODIC_MONTH;
            const extra = getGardenMood(ageApprox, p.fraction, notifyDate);
            
            scheduleNotification(`Phase : ${p.name}`, `☀️ Énergie du jour : ${extra.mood}`, notifyDate, `phase-${dateStr}`);
        });
    }
}

// Init
updateApp();

// Tenter une mise à jour silencieuse de la position au démarrage si déjà autorisé
if (state.hasLocation && !state.isManual && (IS_NATIVE || ('geolocation' in navigator))) {
    getPositionUnified().then(async (pos) => {
        state.lat = pos.coords.latitude;
        state.lon = pos.coords.longitude;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.lat}&lon=${state.lon}&accept-language=fr`);
            const data = await res.json();
            if (data && data.address) {
                const addr = data.address;
                let cityName = addr.city || addr.town || addr.state || addr.province || addr.municipality || addr.village || "Position GPS";
                if (cityName.includes("Phường") || cityName.includes("Huyện")) {
                    cityName = addr.state || addr.province || cityName;
                }
                state.city = cityName;
                state.country = addr.country || "";
                saveState();
                updateApp();
            }
        } catch (e) { /* ignore */ }
    }).catch(() => { });
}

// --- PWA Service Worker Registration & Auto-Update (web uniquement) ---
if (!IS_NATIVE && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            console.log('[PWA] Service Worker enregistré');

            // Vérifier les mises à jour toutes les 60 secondes
            setInterval(() => {
                registration.update();
            }, 60000);

            // Écouter les nouveaux service workers
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Nouvelle version disponible !
                        if (confirm('Nouvelle version de Moonlight disponible ! Recharger maintenant ?')) {
                            newWorker.postMessage('skipWaiting');
                            window.location.reload();
                        }
                    }
                });
            });
        })
        .catch(err => console.log('[PWA] Erreur SW:', err));

    // Recharger la page quand le nouveau SW prend le contrôle
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}
