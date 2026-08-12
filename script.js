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
    seasonalTitle: document.getElementById('seasonalTitle'),
    cardNextEvent: document.getElementById('cardNextEvent'),
    nextEventIcon: document.getElementById('nextEventIcon'),
    nextEventTitle: document.getElementById('nextEventTitle'),
    nextEventWhen: document.getElementById('nextEventWhen'),
    nextEventDetail: document.getElementById('nextEventDetail'),
    eventFilters: document.getElementById('eventFilters'),
    eventsList: document.getElementById('eventsList'),
    eventsIntro: document.getElementById('eventsIntro')
};

// --- Constants ---
const SYNODIC_MONTH = 29.53058867;
const REFERENCE_NEW_MOON = new Date('2000-01-06T12:24:00Z');

// Moteur astronomique précis (astro.js, adossé à astronomy-engine). Le modèle
// synodique moyen ci-dessus reste en place uniquement comme repli : il place les
// phases à plusieurs heures, parfois un jour entier, de leur instant réel, et il
// ne sait rien des éclipses, des saisons ni des planètes.
const ASTRO_OK = !!(window.Astro && window.Astro.ready);
if (ASTRO_OK) Astro.setTimezone(state.timezone);

// --- Gardening & Mood Logic ---
const GARDEN_ADVICE = {
    root: { icon: "🥕", type: "Jour Racine", action: "Idéal pour semer/récolter carottes, radis, oignons..." },
    leaf: { icon: "🥬", type: "Jour Feuille", action: "Occupez-vous des salades, épinards, herbes..." },
    flower: { icon: "🌸", type: "Jour Fleur", action: "Bon pour les fleurs et légumes-fleurs (brocolis)." },
    fruit: { icon: "🍅", type: "Jour Fruit", action: "Semis et récolte de tomates, haricots, petits fruits." },
    rest: { icon: "⛔", type: "Repos", action: "La lune est défavorable (nœud lunaire/apogée/périgée). Reposez-vous." }
};

// Banque « Énergie du jour » GÉNÉRÉE par scripts/gen_energy.mjs — NE PAS éditer à la main.
// 8 phases, sélection déterministe identique au widget natif (MoonWidget.swift).
const ENERGY_LIB = [
    [ // 0
        "🌑 Dans le noir total, tout devient possible. Pose une intention.",
        "🌱 La graine se sème dans l'obscurité. Rêve ton prochain cycle.",
        "🤫 Fais silence. C'est dans le vide que naissent les commencements.",
        "🕯️ Allume une intention comme on allume une bougie.",
        "🌌 La nuit la plus sombre porte déjà la lumière à venir.",
        "🧭 Choisis une direction, même minuscule. Le cycle s'ouvre.",
        "💤 Repose-toi : la terre aussi dort avant de germer.",
        "✍️ Écris ce que tu veux faire éclore. Les mots sèment.",
        "🌑 Rien à montrer, tout à imaginer. Laisse venir.",
        "🫧 Vide-toi du superflu pour faire place au neuf.",
        "🌒 Un nouveau souffle commence. Inspire profondément.",
        "🔮 Écoute tes désirs discrets : ils dessinent demain.",
        "🪔 Dans l'ombre, ta lumière intérieure suffit.",
        "🌰 Tout grand arbre fut d'abord une intention dans le noir.",
        "🧘 Reviens à toi. Le commencement est intérieur.",
        "🌑 Ne force rien. Plante, puis laisse l'invisible travailler.",
        "💫 Formule un vœu simple et sincère. La lune t'écoute.",
        "🌊 Laisse refluer l'ancien cycle. Accueille la page blanche.",
        "🕊️ Pardonne-toi le repos. Germer demande du silence.",
        "🌑 Premier jour d'un nouveau rêve. Que veux-tu appeler à toi ?",
    ],
    [ // 1
        "🌒 La première lueur perce. Ose un premier pas.",
        "🌱 Ta graine pointe. Protège ce qui commence.",
        "🔥 Une petite flamme grandit en toi. Nourris-la.",
        "🚶 Avance doucement : l'élan se construit pas à pas.",
        "🌿 Le fragile a besoin de patience, pas de pression.",
        "💪 Le courage, c'est continuer même quand c'est ténu.",
        "🌒 Crois en ce qui n'est pas encore visible.",
        "🪴 Arrose ton intention par de petites actions.",
        "✨ Ce qui émerge est précieux. Veille sur lui.",
        "🌊 Le mouvement monte. Laisse-toi porter sans te précipiter.",
        "🎯 Garde le cap : la constance fait germer les rêves.",
        "🌒 Encore frêle, déjà vivant. Honore le début.",
        "🤲 Accueille l'aide : on grandit rarement seul.",
        "🌤️ Après l'obscurité, la confiance revient lentement.",
        "🪶 Sois doux avec tes premiers essais maladroits.",
        "🌱 Chaque geste compte plus que sa taille.",
        "🧗 La pente est douce encore. Prends de l'élan.",
        "💡 Une idée neuve demande qu'on y croie en premier.",
        "🌒 Laisse pousser sans déterrer pour vérifier.",
        "🌅 Le jour se lève sur ton projet. Continue.",
    ],
    [ // 2
        "🌓 Mi-chemin : c'est l'heure de décider.",
        "⚔️ Les obstacles arrivent pour révéler ta volonté.",
        "💥 Agis maintenant. L'hésitation use plus que l'effort.",
        "🧱 Un mur ? Une marche déguisée. Monte.",
        "🌓 Tension féconde : c'est le moment de pousser.",
        "🔨 Construis. Les rêves veulent des mains.",
        "🚀 Engage-toi pour de vrai. Saute.",
        "🦁 Affronte ce que tu évites. Ta force est là.",
        "⚖️ Choisis : on ne grandit pas en restant entre deux.",
        "🌓 Le doute est normal. Avance avec lui.",
        "🛠️ Ajuste, corrige, persiste. Ne lâche pas.",
        "🔥 Mets ton énergie là où ça compte vraiment.",
        "🧭 Réaffirme ta direction et tiens-la.",
        "💪 La résistance prouve que tu progresses.",
        "🌊 Fends la vague au lieu de la subir.",
        "🎬 Action : ce qui n'est pas tenté reste un regret.",
        "🌓 Demi-lune, pleine détermination.",
        "🪓 Coupe ce qui te freine. Décide net.",
        "⏫ Passe à l'étape supérieure. Tu es prêt.",
        "🏹 Vise, tends l'arc, lâche.",
    ],
    [ // 3
        "🌔 Presque pleine : affine plutôt que d'ajouter.",
        "🔍 Soigne les détails. La beauté est dans le fini.",
        "🌱 Patiente : ce qui mûrit ne se presse pas.",
        "🧵 Resserre les fils, peaufine ton œuvre.",
        "🌔 Tu approches. Garde la foi et le rythme.",
        "🪄 Polis ton intention jusqu'à ce qu'elle brille.",
        "🌊 La marée monte presque à son comble. Tiens bon.",
        "🧘 Respire : la dernière ligne droite teste la patience.",
        "🔧 Corrige le cap sans tout recommencer.",
        "🌔 Fais confiance au processus, même imparfait.",
        "📈 Les efforts s'accumulent. Bientôt la récolte.",
        "🕰️ Donne du temps au temps. Ça prend forme.",
        "🌔 Encore un peu : ne sabote pas si près du but.",
        "🪞 Relis, ajuste, améliore. Puis lâche.",
        "🌗 La maturité approche. Cultive la constance.",
        "💎 Ce qui se construit lentement dure longtemps.",
        "🌔 Affûte tes intentions comme une lame.",
        "🤝 Demande un regard extérieur pour parfaire.",
        "🌾 La promesse gonfle. Prépare la moisson.",
        "✨ Tu es plus proche que tu ne crois. Continue.",
    ],
    [ // 4
        "🌕 Tout s'illumine. Célèbre le chemin parcouru.",
        "🌝 Lumière maximale : vois clair en toi.",
        "🙏 Gratitude. Compte tes récoltes, pas tes manques.",
        "🌊 Les émotions débordent. Laisse-les couler sans peur.",
        "🎉 Honore ce que tu as accompli, même petit.",
        "🌕 Ce qui était caché se révèle. Accueille la vérité.",
        "💞 Cœur ouvert : aime, remercie, pardonne.",
        "🔥 Énergie à son comble. Rayonne sans te brûler.",
        "🌕 Relâche ce qui pèse. La pleine lune libère.",
        "✨ Savoure l'instant : ce sommet est éphémère.",
        "🌝 Danse, chante, ressens. La vie est intense ce soir.",
        "🪞 La clarté montre aussi ce qui doit changer.",
        "🌕 Récolte les fruits de tes intentions semées.",
        "💫 Tes sens sont aiguisés. Écoute ton intuition.",
        "🌊 Marée haute des émotions : respire, ne te noie pas.",
        "🕯️ Fais le bilan à la lumière pleine.",
        "🌕 Plénitude : tu es exactement où il faut.",
        "🤍 Pardonne-toi. La lumière n'accuse pas, elle éclaire.",
        "🎆 Célèbre, partage ta joie : elle se multiplie.",
        "🌝 Lève les yeux : la beauté te répond.",
    ],
    [ // 5
        "🌖 Le trop-plein se partage. Donne ce que tu as reçu.",
        "🤲 Transmets : ton expérience éclaire les autres.",
        "🌾 Temps de la récolte partagée. Sois généreux.",
        "📖 Raconte ton chemin, il sert à quelqu'un.",
        "🌖 Reçois les fruits, puis offre-les.",
        "💬 Exprime ta gratitude à voix haute.",
        "🍂 La décrue commence. Relâche en douceur.",
        "🫶 Aider est aussi une manière de grandir.",
        "🌖 Diffuse ta lumière sans t'épuiser.",
        "🧩 Tire les leçons de ce qui vient de culminer.",
        "🌱 Sème pour autrui ce que tu as appris.",
        "🕊️ Le partage allège le cœur.",
        "🌖 Range, trie, redonne ce qui ne sert plus.",
        "🙌 Célèbre les autres, pas seulement toi.",
        "🌗 La lumière décline : commence à intérioriser.",
        "🍯 Savoure les fruits mûrs avant qu'ils ne passent.",
        "🌖 Reconnais l'aide reçue. Dis merci.",
        "🌊 Le reflux porte ses propres cadeaux.",
        "🔁 Boucle ce qui doit l'être, transmets le reste.",
        "💝 Ta générosité revient toujours, autrement.",
    ],
    [ // 6
        "🌗 L'heure du tri. Lâche ce qui n'est plus toi.",
        "✂️ Coupe les liens usés sans culpabilité.",
        "🍂 Laisse tomber les feuilles mortes du cycle.",
        "🧹 Nettoie, range, allège ton espace et ta tête.",
        "🌗 Pardonne, pour te libérer plus que l'autre.",
        "🔓 Défais ce qui t'enferme. Respire.",
        "🪶 Tout n'a pas à être gardé. Déleste-toi.",
        "🌗 Remets en question ce qui ne marche plus.",
        "🌊 Le reflux emporte l'inutile. Laisse partir.",
        "🕯️ Fais le deuil de ce qui est terminé.",
        "🧺 Vide pour faire place. Le neuf veut de l'espace.",
        "🌗 Termine ce qui traîne, n'entame rien de grand.",
        "🍃 Détache-toi doucement, sans te juger.",
        "🔄 Réévalue tes choix à tête reposée.",
        "🌗 Ce qui s'efface libère de l'énergie.",
        "🚪 Ferme certaines portes pour en ouvrir d'autres.",
        "🧘 Introspection : que t'a appris ce cycle ?",
        "🪣 Jette le superflu, garde l'essentiel.",
        "🌗 Lâcher-prise n'est pas perdre, c'est s'alléger.",
        "🌙 Range le passé pour rêver le futur.",
    ],
    [ // 7
        "🌘 Le cycle s'achève. Repose-toi vraiment.",
        "💤 Dors, rêve, recharge. Tu as assez fait.",
        "🕊️ Abandonne le contrôle. Laisse la vie respirer.",
        "🌘 Retire-toi un peu du monde. Soigne-toi.",
        "🍵 Ralentis. Le silence guérit.",
        "🌙 Presque dans le noir : prépare doucement le neuf.",
        "🧘 Médite. Écoute ce qui se tait en toi.",
        "🌘 Ne commence rien de grand. Laisse mûrir.",
        "🌾 La terre se repose après la récolte. Toi aussi.",
        "💧 Pleure si besoin : l'eau lave et libère.",
        "🌘 Fais le bilan tendre du cycle écoulé.",
        "🕯️ Veille basse : économise ta lumière.",
        "🤍 Sois doux avec ta fatigue. Elle a un sens.",
        "🌘 Le vide revient : accueille-le sans peur.",
        "🛌 Le repos n'est pas une perte de temps.",
        "🌌 Rêve grand pendant que tout se tait.",
        "🍂 Laisse partir les derniers regrets.",
        "🌘 Boucle la boucle. Remercie, puis relâche.",
        "🌊 Marée basse de l'âme : reconstitue tes forces.",
        "🌑 Bientôt la nouvelle lune. Prépare ton vœu.",
    ],
];
function energyHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; } return h; }
function energyPhaseIndex(pf) {
    if (pf < 0.02 || pf > 0.98) return 0;
    if (pf < 0.24) return 1;
    if (pf < 0.26) return 2;
    if (pf < 0.49) return 3;
    if (pf < 0.51) return 4;
    if (pf < 0.74) return 5;
    if (pf < 0.76) return 6;
    return 7;
}
function energyOfDay(pf, d) {
    const idx = energyPhaseIndex(pf);
    const arr = ENERGY_LIB[idx];
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${idx}`;
    const n = arr.length;
    const i = ((energyHash(key) % n) + n) % n;
    return arr[i];
}

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

    // Énergie du jour (banque générée, déterministe : stable/jour, variable/mois)
    const mood = energyOfDay(phaseFraction, targetDate);

    return { garden: GARDEN_ADVICE[gardenKey], mood };
}

// --- Astronomical Logic ---

function getMoonData(date, timezone) {
    let age, phaseFraction, illumination;

    if (ASTRO_OK) {
        const st = Astro.moonState(date);
        age = st.age;
        phaseFraction = st.phaseFraction;
        illumination = st.illumination;
    } else {
        const diffTime = date.getTime() - REFERENCE_NEW_MOON.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        age = diffDays % SYNODIC_MONTH;
        if (age < 0) age += SYNODIC_MONTH;
        phaseFraction = age / SYNODIC_MONTH;
        illumination = 0.5 * (1 - Math.cos(2 * Math.PI * phaseFraction));
    }

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
    // Les seules fractions demandées par l'app sont les quatre phases majeures.
    // Le moteur précis donne leur instant exact, à la seconde près.
    if (ASTRO_OK) {
        const quarter = Math.round(targetPhaseFraction * 4) % 4;
        const exact = Astro.nextQuarter(startDate, quarter);
        if (exact) return exact;
    }

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

    // Detail View : lever et coucher réels, calculés pour la position de
    // l'utilisateur. Sans position connue on n'affiche rien plutôt que d'inventer
    // une heure, ce que faisait la version précédente.
    if (ASTRO_OK && state.hasLocation && typeof state.lat === 'number' && typeof state.lon === 'number') {
        const rs = Astro.moonState(now, state.lat, state.lon);
        els.moonRise.textContent = rs.rise ? formatLocal(rs.rise, tz) : "Pas de lever aujourd'hui";
        els.moonSet.textContent = rs.set ? formatLocal(rs.set, tz) : "Pas de coucher aujourd'hui";
    } else {
        els.moonRise.textContent = "Position requise";
        els.moonSet.textContent = "Position requise";
    }

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

    // Le calcul des événements sur douze mois prend une centaine de millisecondes.
    // On le repousse d'un tick pour laisser la Lune s'afficher immédiatement.
    if (ASTRO_OK) setTimeout(renderEvents, 0);
}

function generateUpcomingList(now, tz) {
    els.upcomingPhasesList.innerHTML = '';
    let phases = [];

    if (ASTRO_OK) {
        // Instants exacts des pleines et nouvelles lunes, sans dérive cumulée.
        phases = Astro.nextPhases(now, 14)
            .filter(p => p.quarter === 0 || p.quarter === 2)
            .slice(0, 6)
            .map(p => ({ date: p.date, type: p.name }));
    } else {
        const nextNew = getNextPhaseDate(0, now);
        const nextFull = getNextPhaseDate(0.5, now);
        const start = (nextFull < nextNew) ? nextFull : nextNew;
        const first = (nextFull < nextNew) ? "Pleine Lune" : "Nouvelle Lune";
        for (let i = 0; i < 6; i++) {
            const d = new Date(start.getTime() + i * SYNODIC_MONTH / 2 * 24 * 60 * 60 * 1000);
            phases.push({ date: d, type: i % 2 === 0 ? first : (first === "Pleine Lune" ? "Nouvelle Lune" : "Pleine Lune") });
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

// --- Événements astronomiques ---

// Fenêtre couverte par la liste et par les alertes.
const EVENT_HORIZON_DAYS = 365;

// Correspondance entre un type d'événement et le réglage qui l'autorise à notifier.
const EVENT_SETTING = {
    'eclipse-solar': 'evtEclipse',
    'eclipse-lunar': 'evtEclipse',
    supermoon: 'evtLune',
    micromoon: 'evtLune',
    bluemoon: 'evtLune',
    blackmoon: 'evtLune',
    meteor: 'evtMeteor',
    planet: 'evtPlanet',
    conjunction: 'evtPlanet',
    season: 'evtSaison'
};

let eventCache = null;      // { key, list }
let eventFilter = 'all';

// Les événements dépendent de la position et du jour ; on ne recalcule que si
// l'un des deux a bougé. Le calcul complet prend moins de 100 ms, mais autant
// éviter de le refaire à chaque rendu.
function getEvents() {
    if (!ASTRO_OK) return [];

    const hasPos = state.hasLocation && typeof state.lat === 'number' && typeof state.lon === 'number';
    const now = new Date();
    const key = [
        now.toISOString().slice(0, 10),
        hasPos ? state.lat.toFixed(2) : 'x',
        hasPos ? state.lon.toFixed(2) : 'x'
    ].join('|');

    if (eventCache && eventCache.key === key) return eventCache.list;

    const to = new Date(now.getTime() + EVENT_HORIZON_DAYS * 24 * 60 * 60 * 1000);
    let list = [];
    try {
        list = hasPos ? Astro.events(now, to, state.lat, state.lon) : Astro.events(now, to);
    } catch (e) {
        console.log('[Astro] events', e);
        list = [];
    }

    eventCache = { key, list };
    return list;
}

// « dans 3 jours », « demain », « aujourd'hui »...
function countdownLabel(date) {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfEvent = new Date(date); startOfEvent.setHours(0, 0, 0, 0);
    const days = Math.round((startOfEvent - startOfToday) / (24 * 60 * 60 * 1000));

    if (days <= 0) return "Aujourd'hui";
    if (days === 1) return 'Demain';
    if (days < 31) return 'Dans ' + days + ' jours';
    const months = Math.round(days / 30.44);
    return 'Dans ' + months + ' mois';
}

function renderNextEventCard() {
    if (!els.cardNextEvent) return;

    const list = getEvents();
    const visible = list.filter(e => e.visible);

    // Dans la semaine qui vient, on met en avant l'événement le plus marquant
    // plutôt que le plus proche : une éclipse passe avant un essaim de météores
    // qui tombe le même jour. Au-delà, on affiche simplement le prochain.
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const imminent = visible.filter(e => e.date <= soon);
    const next = imminent.length
        ? imminent.reduce((best, e) => (e.importance > best.importance ? e : best), imminent[0])
        : (visible[0] || list[0]);

    if (!next) {
        els.cardNextEvent.style.display = 'none';
        return;
    }

    els.cardNextEvent.style.display = '';
    els.nextEventIcon.textContent = next.icon;
    els.nextEventTitle.textContent = next.title;
    els.nextEventWhen.textContent = countdownLabel(next.date) + ' • ' + Astro.dayLabel(next.date) + ' à ' + Astro.hm(next.date);
    els.nextEventDetail.textContent = next.detail;
}

function renderEventFilters() {
    if (!els.eventFilters || els.eventFilters.children.length) return;

    const filters = [
        { key: 'all', label: 'Tout' },
        { key: 'Éclipse', label: 'Éclipses' },
        { key: 'Lune', label: 'Lune' },
        { key: 'Météores', label: 'Météores' },
        { key: 'Planète', label: 'Planètes' },
        { key: 'Saison', label: 'Saisons' }
    ];

    filters.forEach(f => {
        const b = document.createElement('button');
        b.className = 'event-chip' + (f.key === eventFilter ? ' on' : '');
        b.textContent = f.label;
        b.dataset.key = f.key;
        b.addEventListener('click', () => {
            eventFilter = f.key;
            Array.from(els.eventFilters.children).forEach(c => c.classList.toggle('on', c.dataset.key === eventFilter));
            renderEventsList();
        });
        els.eventFilters.appendChild(b);
    });
}

function renderEventsList() {
    if (!els.eventsList) return;

    if (!ASTRO_OK) {
        els.eventsList.innerHTML = '<div class="event-empty">Le moteur astronomique n\'a pas pu être chargé.</div>';
        return;
    }

    const hasPos = state.hasLocation && typeof state.lat === 'number' && typeof state.lon === 'number';
    if (els.eventsIntro) {
        els.eventsIntro.textContent = hasPos
            ? "Éclipses, solstices, super lunes, pluies d'étoiles filantes et planètes, calculés pour votre position sur les douze prochains mois."
            : "Éclipses, solstices, super lunes, pluies d'étoiles filantes et planètes sur les douze prochains mois. Indiquez votre position dans Réglages pour savoir ce qui est visible de chez vous.";
    }

    const list = getEvents().filter(e => eventFilter === 'all' || e.category === eventFilter);
    els.eventsList.innerHTML = '';

    if (!list.length) {
        els.eventsList.innerHTML = '<div class="event-empty">Aucun événement de cette catégorie dans les douze prochains mois.</div>';
        return;
    }

    list.forEach(e => {
        const div = document.createElement('div');
        div.className = 'event-item'
            + (e.importance >= 3 ? ' is-major' : (e.visible ? ' is-visible' : ''))
            + (e.visible ? '' : ' is-hidden-away');

        const when = document.createElement('div');
        when.className = 'event-when';
        when.innerHTML = '<span class="event-countdown">' + countdownLabel(e.date) + '</span> • '
            + Astro.dayLabel(e.date) + ' à ' + Astro.hm(e.date);

        const title = document.createElement('div');
        title.className = 'event-title';
        title.textContent = e.title;

        const detail = document.createElement('div');
        detail.className = 'event-detail';
        detail.textContent = e.detail;

        const emoji = document.createElement('div');
        emoji.className = 'event-emoji';
        emoji.textContent = e.icon;

        const body = document.createElement('div');
        body.className = 'event-body';
        body.appendChild(when);
        body.appendChild(title);
        body.appendChild(detail);

        div.appendChild(emoji);
        div.appendChild(body);
        els.eventsList.appendChild(div);
    });
}

function renderEvents() {
    renderNextEventCard();
    renderEventFilters();
    renderEventsList();
}

// Depuis la carte d'accueil, on bascule sur l'onglet Ciel.
if (els.cardNextEvent) {
    els.cardNextEvent.addEventListener('click', () => {
        const target = document.querySelector('.nav-item[data-target="view-events"]');
        if (target) target.click();
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
    phaseAnnonce: document.getElementById('togglePhaseAnnonce'),
    evtEclipse: document.getElementById('toggleEvtEclipse'),
    evtLune: document.getElementById('toggleEvtLune'),
    evtMeteor: document.getElementById('toggleEvtMeteor'),
    evtPlanet: document.getElementById('toggleEvtPlanet'),
    evtSaison: document.getElementById('toggleEvtSaison')
};

let notificationSettings = {
    enabled: false, // interrupteur maître : les rappels sont actifs ou non
    fullMoon: true,
    newMoon: false,
    rem3d: false,
    rem1d: false,
    remDay: true,
    phaseAnnonce: false,
    // Événements astronomiques, tous annoncés par défaut. Cela représente une
    // quarantaine de notifications par an, un peu plus de trois par mois.
    evtEclipse: true,
    evtLune: true,
    evtMeteor: true,
    evtPlanet: true,
    evtSaison: true
};

// Version des réglages. À incrémenter quand on change une valeur par défaut :
// sans cela, une installation existante conserverait indéfiniment l'ancienne
// valeur, déjà écrite dans localStorage, et ne verrait jamais le changement.
const SETTINGS_VERSION = 2;

// Load saved toggle states
function loadToggleStates() {
    const saved = localStorage.getItem('moonlight_toggles');
    if (saved) {
        // Fallback for previous structure
        const parsed = JSON.parse(saved);
        notificationSettings = { ...notificationSettings, ...parsed };

        // Migration v2 : les planètes et les saisons passent en alerte. On force
        // la valeur une seule fois, puis on l'enregistre, pour qu'un utilisateur
        // qui les désactiverait ensuite ne les voie pas revenir à chaque
        // ouverture de l'app.
        if ((parsed.settingsVersion || 1) < 2) {
            notificationSettings.evtPlanet = true;
            notificationSettings.evtSaison = true;
        }
    }
    if (notificationSettings.settingsVersion !== SETTINGS_VERSION) {
        notificationSettings.settingsVersion = SETTINGS_VERSION;
        localStorage.setItem('moonlight_toggles', JSON.stringify(notificationSettings));
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

// Planifie une liste de notifications en un seul appel natif (bien plus fiable
// et rapide qu'un appel par notification quand on en programme plusieurs dizaines).
async function scheduleBatch(items) {
    if (!items.length) return;

    if (IS_NATIVE && NativePlugins.LocalNotifications) {
        try {
            await NativePlugins.LocalNotifications.schedule({
                notifications: items.map(n => ({
                    id: tagToId(n.tag),
                    title: n.title,
                    body: n.body,
                    schedule: { at: n.date, allowWhileIdle: true }
                }))
            });
        } catch (e) { console.log('[LN] scheduleBatch', e); }
        return;
    }

    for (const n of items) {
        await scheduleNotification(n.title, n.body, n.date, n.tag);
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

// iOS ne conserve que 64 notifications locales en attente par application. Au-delà,
// les plus lointaines sont silencieusement jetées par le système. On garde une marge.
const MAX_PENDING_NOTIFICATIONS = 58;

// Nombre de phases majeures (NL, PQ, PL, DQ) couvertes par une planification.
// 52 phases valent environ 13 mois : comme on replanifie à chaque ouverture de l'app,
// l'utilisateur reste couvert tant qu'il ouvre Moonlight au moins une fois par an.
const PHASE_HORIZON = 52;

const PHASE_FRACTION_NAMES = {
    0: "Nouvelle Lune",
    0.25: "Premier Quartier",
    0.5: "Pleine Lune",
    0.75: "Dernier Quartier"
};

// Les `count` prochaines phases majeures après `from`, triées par date.
// Chaque phase est recalculée depuis la précédente plutôt qu'obtenue en ajoutant
// un pas fixe : la dérive ne s'accumule pas sur un horizon d'un an.
function upcomingPhaseEvents(from, count) {
    const events = [];
    let cursor = new Date(from.getTime());

    for (let i = 0; i < count; i++) {
        let next = null;
        for (const fraction of [0, 0.25, 0.5, 0.75]) {
            const date = getNextPhaseDate(fraction, cursor);
            if (!next || date < next.date) next = { date, fraction };
        }
        events.push({ ...next, name: PHASE_FRACTION_NAMES[next.fraction] });
        // On repart juste après la phase trouvée pour ne pas retomber dessus.
        cursor = new Date(next.date.getTime() + 60 * 60 * 1000);
    }

    return events;
}

async function scheduleAllNotifications() {
    // Interrupteur maître : si les rappels sont désactivés, ne rien planifier.
    if (!notificationSettings.enabled) { await cancelAllScheduled(); return; }
    if (!(await notifGranted())) return;

    // Purge les notifications déjà planifiées avant de reprogrammer (évite les doublons).
    await cancelAllScheduled();

    const now = new Date();
    const events = upcomingPhaseEvents(now, PHASE_HORIZON);

    const queue = [];
    const enqueue = (date, title, body, tag) => {
        if (date.getTime() > Date.now()) queue.push({ date, title, body, tag });
    };

    events.forEach((p) => {
        const isFull = p.fraction === 0.5;
        const isNew = p.fraction === 0;
        const evtTime = p.date.getTime();
        const dateStr = p.date.toISOString().slice(0, 10);

        // Rappels avant la Pleine / Nouvelle Lune
        if ((isFull && notificationSettings.fullMoon) || (isNew && notificationSettings.newMoon)) {
            if (notificationSettings.rem3d) {
                enqueue(new Date(evtTime - 3 * 24 * 60 * 60 * 1000),
                    `J-3 ${p.name}`, `Dans 3 jours, ce sera la ${p.name}. Préparez-vous !`, `rem-3d-${dateStr}`);
            }
            if (notificationSettings.rem1d) {
                enqueue(new Date(evtTime - 1 * 24 * 60 * 60 * 1000),
                    `J-1 ${p.name}`, `Demain, c'est la ${p.name}.`, `rem-1d-${dateStr}`);
            }
            if (notificationSettings.remDay) {
                // Phase le matin : on prévient 8h avant (donc la veille au soir).
                // Phase l'après-midi ou le soir : 1h avant suffit.
                const hoursBefore = (p.date.getHours() < 12) ? 8 : 1;
                enqueue(new Date(evtTime - hoursBefore * 60 * 60 * 1000),
                    `H-${hoursBefore} ${p.name}`,
                    `La ${p.name} aura lieu dans environ ${hoursBefore} heure(s).`,
                    `rem-day-${dateStr}`);
            }
        }

        // Annonce de la phase + énergie du jour, à 09:00 le jour J, pour les 4 phases.
        if (notificationSettings.phaseAnnonce) {
            const notifyDate = new Date(p.date);
            notifyDate.setHours(9, 0, 0, 0);
            const extra = getGardenMood(p.fraction * SYNODIC_MONTH, p.fraction, notifyDate);
            enqueue(notifyDate, `Phase : ${p.name}`, `☀️ Énergie du jour : ${extra.mood}`, `phase-${dateStr}`);
        }
    });

    // Événements astronomiques : éclipses, super lunes, essaims de météores,
    // planètes, saisons. Chacun est annoncé au moment où l'utilisateur peut encore
    // s'organiser, et non au moment où il est déjà trop tard.
    if (ASTRO_OK) {
        const atHour = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };

        getEvents().forEach((e) => {
            const setting = EVENT_SETTING[e.type];
            if (!setting || !notificationSettings[setting]) return;

            // Un événement non visible depuis la position n'a pas à réveiller
            // le téléphone. Il reste consultable dans l'onglet Ciel.
            if (!e.visible) return;

            if (e.type === 'eclipse-solar' && e.beginDate) {
                // La veille au soir, puis une heure avant le premier contact.
                enqueue(atHour(new Date(e.beginDate.getTime() - 24 * 60 * 60 * 1000), 18),
                    'Demain : ' + e.title,
                    'Début à ' + Astro.hm(e.beginDate) + '. Pensez à vos lunettes d\'éclipse certifiées ISO 12312-2.',
                    'evt-' + e.id + '-j1');
                enqueue(new Date(e.beginDate.getTime() - 60 * 60 * 1000),
                    e.title + ' dans une heure',
                    'Début à ' + Astro.hm(e.beginDate) + '. Ne regardez jamais le Soleil sans lunettes d\'éclipse certifiées.',
                    'evt-' + e.id + '-h1');
                return;
            }

            if (e.type === 'eclipse-lunar') {
                enqueue(atHour(new Date(e.date.getTime() - 24 * 60 * 60 * 1000), 18),
                    'Demain : ' + e.title, 'Maximum à ' + Astro.hm(e.date) + '. Observable à l\'œil nu.', 'evt-' + e.id + '-j1');
                enqueue(new Date(e.date.getTime() - 60 * 60 * 1000),
                    e.title + ' dans une heure', 'Maximum à ' + Astro.hm(e.date) + '.', 'evt-' + e.id + '-h1');
                return;
            }

            if (e.type === 'meteor') {
                // Un essaim s'observe la nuit, on prévient en début de soirée.
                // Un maximum qui tombe avant midi appartient à la nuit précédente :
                // on prévient donc la veille au soir, sinon l'utilisateur sortirait
                // une nuit trop tard.
                const soir = new Date(e.date);
                if (soir.getHours() < 12) soir.setDate(soir.getDate() - 1);
                enqueue(atHour(soir, 21), e.title, e.detail, 'evt-' + e.id);
                return;
            }

            if (e.type === 'season') {
                enqueue(atHour(e.date, 9), e.title, e.detail, 'evt-' + e.id);
                return;
            }

            // Super lunes, lunes bleues, planètes, rapprochements : en fin
            // d'après-midi, quand on peut encore décider de sortir le soir.
            enqueue(atHour(e.date, 18), e.title, e.detail, 'evt-' + e.id);
        });
    }

    // On garde les plus proches dans le temps : ce sont celles qui comptent, et
    // la replanification à chaque ouverture prendra le relais pour la suite.
    queue.sort((a, b) => a.date - b.date);
    await scheduleBatch(queue.slice(0, MAX_PENDING_NOTIFICATIONS));
}

// Replanification au lancement ET à chaque retour au premier plan.
// Sans ça, les notifications planifiées s'épuisent et l'utilisateur ne reçoit
// plus jamais rien tant qu'il ne retouche pas un réglage.
scheduleAllNotifications();
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleAllNotifications();
});

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
