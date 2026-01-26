// --- State (Persisté via localStorage) ---
let state = {
    lat: 46.20,
    lon: 6.14,
    city: "",
    country: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
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

function getGardenMood(age, phaseFraction) {
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
        const todayIndex = new Date().getDate() % list.length;
        mood = list[todayIndex];
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

    if (phaseFraction < 0.02 || phaseFraction > 0.98) { d = ""; } // New
    else if (phaseFraction > 0.48 && phaseFraction < 0.52) { // Full
        d = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
    } else {
        const termRx = Math.abs(phaseFraction - 0.5) * 2 * r;
        let sweepTerm = 0;
        let lightSideRight = false;

        if (isNorth) {
            lightSideRight = phaseFraction < 0.5;
            sweepTerm = (phaseFraction < 0.25 || phaseFraction > 0.75) ? 0 : 1;
        } else {
            lightSideRight = phaseFraction >= 0.5;
            sweepTerm = (phaseFraction >= 0.25 && phaseFraction < 0.75) ? 0 : 1;
        }

        if (lightSideRight) {
            d += `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`;
            d += ` A ${termRx} ${r} 0 0 ${sweepTerm} ${cx} ${cy - r}`;
        } else {
            d += `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r}`;
            d += ` A ${termRx} ${r} 0 0 ${sweepTerm} ${cx} ${cy - r}`;
        }
    }
    els.moonPath.setAttribute('d', d);
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

    // Display: Priorité au state utilisateur, sinon fallback Genève
    const displayCity = state.city || (state.lat === 46.20 && state.lon === 6.14 ? "Genève" : "Ma Position");
    const displayCountry = state.country || (state.lat === 46.20 && state.lon === 6.14 ? "Suisse" : "");

    els.headerCity.textContent = displayCity;
    els.headerCountry.textContent = displayCountry;

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

    // Detail View
    els.moonRise.textContent = "06:" + Math.floor(6 + (data.age / SYNODIC_MONTH) * 24 % 24).toString().padStart(2, '0'); // Approx
    els.moonSet.textContent = "18:" + Math.floor(18 + (data.age / SYNODIC_MONTH) * 24 % 24).toString().padStart(2, '0'); // Approx

    // --- NEW: Garden & Mood Logic ---
    const extra = getGardenMood(data.age, data.phaseFraction);

    if (els.gardenIcon) { // Check if elements exist
        els.gardenIcon.textContent = extra.garden.icon;
        els.gardenType.textContent = extra.garden.type;
        els.gardenAction.textContent = extra.garden.action;
        els.moodText.textContent = extra.mood;

        const seasonal = getSeasonalItems();
        els.seasonalText.innerHTML = `🥗 <strong>Légumes:</strong> ${seasonal.veggies}<br>🍎 <strong>Fruits:</strong> ${seasonal.fruits}`;

        const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date());
        if (els.seasonalTitle) els.seasonalTitle.textContent = `De saison (${monthName})`;
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
    saveState();
    updateApp();
});

els.inputCountry.addEventListener('input', (e) => {
    state.country = e.target.value;
    saveState();
    updateApp();
});

// Logique GPS
document.getElementById('btnGps').addEventListener('click', () => {
    els.gpsStatus.textContent = "Recherche du signal...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            // Mise à jour des coordonnées réelles
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
            state.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // Mise à jour fuseau auto

            // Feedback utilisateur
            els.gpsStatus.textContent = "Recherche du nom de la ville...";
            els.gpsStatus.style.color = "var(--accent)";

            // Reverse Geocoding (Gratuit via Nominatim OpenStreetMap)
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.lat}&lon=${state.lon}&accept-language=fr`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.address) {
                        const addr = data.address;
                        state.city = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || "Position GPS";
                        state.country = addr.country || "";
                        els.gpsStatus.textContent = `Position : ${state.city}`;
                    } else {
                        els.gpsStatus.textContent = "Position trouvée (nom inconnu)";
                    }
                    saveState();
                    updateApp();
                })
                .catch(() => {
                    els.gpsStatus.textContent = "Position trouvée !";
                    saveState();
                    updateApp();
                });
        }, () => {
            els.gpsStatus.textContent = "Erreur GPS / Refus permission.";
            els.gpsStatus.style.color = "red";
        });
    } else {
        els.gpsStatus.textContent = "GPS non supporté.";
    }
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


document.querySelectorAll('.toggle-switch').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('on'));
});

window.exportCalendar = () => {
    // 1. Init ICS content
    let startIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Moonlight//NONSGML v1.0//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Phases Lunaires
X-WR-TIMEZONE:UTC
`;
    let endIcs = `END:VCALENDAR`;
    let events = "";

    const now = new Date();
    // Helper formats date to YYYYMMDDTHHmmSSZ
    const formatICSDate = (d) => {
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    // 2. Generate events for next 12 months (approx 25 phases)
    let nextNew = getNextPhaseDate(0, now);
    let nextFull = getNextPhaseDate(0.5, now);
    let phases = [];

    // Determine starting order
    if (nextFull < nextNew) {
        for (let i = 0; i < 25; i++) {
            let d = new Date(nextFull.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Pleine Lune 🌕" : "Nouvelle Lune 🌑", desc: i % 2 === 0 ? "Illumination: 100%" : "Illumination: 0%" });
        }
    } else {
        for (let i = 0; i < 25; i++) {
            let d = new Date(nextNew.getTime() + i * (SYNODIC_MONTH / 2) * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? "Nouvelle Lune 🌑" : "Pleine Lune 🌕", desc: i % 2 === 0 ? "Illumination: 0%" : "Illumination: 100%" });
        }
    }

    phases.forEach(p => {
        let dtStart = formatICSDate(p.date);
        // Event lasts 1 hour
        let dtEnd = formatICSDate(new Date(p.date.getTime() + 60 * 60 * 1000));
        let uid = dtStart + "-moonlight@app";

        events += `BEGIN:VEVENT
UID:${uid}
DTSTART:${dtStart}
DTEND:${dtEnd}
DTSTAMP:${formatICSDate(new Date())}
SUMMARY:${p.type}
DESCRIPTION:${p.desc}
STATUS:CONFIRMED
SEQUENCE:0
TRANSP:TRANSPARENT
END:VEVENT
`;
    });

    // 3. Create blob and download
    const finalIcs = startIcs + events + endIcs;
    const blob = new Blob([finalIcs], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'phases_lunaires.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Init
updateApp();
