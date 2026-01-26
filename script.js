// --- State (Basé sur GPS) ---
let state = {
    lat: 48.85, // Défaut (Paris)
    lon: 2.35,
    city: "Ma Position",
    country: "France",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Auto-detect fuseau horaire navigateur
};

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
    gpsStatus: document.getElementById('gpsStatus')
};

// --- Constants ---
const SYNODIC_MONTH = 29.53058867;
const REFERENCE_NEW_MOON = new Date('2000-01-06T12:24:00Z');

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

    // Update Header Display avec ce que l'utilisateur a tapé ou "Ma Position"
    els.headerCity.textContent = state.city || "Ma Position";
    els.headerCountry.textContent = state.country || "";

    // 2. Visual
    drawMoon(data.phaseFraction, hemisphere);

    // 3. Progress
    const pct = (data.phaseFraction * 100).toFixed(1);
    els.progressFill.style.width = `${pct}%`;
    els.progressMarker.style.left = `${pct}%`;

    // 4. Next Phases
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
    updateApp();
});

els.inputCountry.addEventListener('input', (e) => {
    state.country = e.target.value;
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
            els.gpsStatus.textContent = "Position trouvée !";
            els.gpsStatus.style.color = "var(--accent)";

            // On vide les champs texte pour laisser l'utilisateur écrire ce qu'il veut,
            // ou on peut mettre un message générique.
            // Ici, on force "Ma Position" dans la variable state si vide
            if (!state.city) state.city = "Ma Position";

            updateApp();
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

window.exportCalendar = () => alert("Fichier .ics généré (Simulation)");

// Init
updateApp();
