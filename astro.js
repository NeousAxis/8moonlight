// --- Moteur astronomique de Moonlight ---
//
// S'appuie sur astronomy-engine (vendor/astronomy.browser.min.js, MIT, Don Cross),
// un portage JavaScript des algorithmes de Jean Meeus. Tout est calculé en local,
// hors ligne, sans aucun appel réseau.
//
// Ce module remplace le modèle synodique moyen d'origine, qui se trompait de
// plusieurs heures (et parfois d'un jour entier) sur l'instant exact des phases,
// et qui ne connaissait aucun phénomène en dehors de la Lune.
//
// Expose un global `Astro`. Si la bibliothèque n'a pas pu être chargée,
// `Astro.ready` vaut false et l'appelant se rabat sur l'ancien calcul.

(function (global) {
    'use strict';

    const AE = global.Astronomy;
    const DAY_MS = 86400000;

    if (!AE) {
        global.Astro = { ready: false };
        return;
    }

    // ---------------------------------------------------------------------
    // Bases
    // ---------------------------------------------------------------------

    const QUARTER_NAMES = ['Nouvelle Lune', 'Premier Quartier', 'Pleine Lune', 'Dernier Quartier'];

    // L'app ne connaît pas l'altitude de l'utilisateur. L'erreur induite sur un
    // lever ou un coucher est de l'ordre de la minute, négligeable devant
    // l'incertitude de la réfraction atmosphérique.
    function observer(lat, lon) {
        return new AE.Observer(lat, lon, 0);
    }

    // Position dans le cycle lunaire, de 0 (nouvelle lune) à 1 (nouvelle lune
    // suivante). C'est la convention attendue par drawMoon() dans script.js.
    function phaseFraction(date) {
        return AE.MoonPhase(date) / 360;
    }

    function moonDistanceKm(date) {
        return AE.GeoVector(AE.Body.Moon, date, true).Length() * AE.KM_PER_AU;
    }

    // État de la Lune à un instant donné, pour un observateur optionnel.
    function moonState(date, lat, lon) {
        const pf = phaseFraction(date);
        const out = {
            phaseFraction: pf,
            illumination: AE.Illumination(AE.Body.Moon, date).phase_fraction,
            age: pf * 29.530588853,
            distanceKm: moonDistanceKm(date),
            rise: null,
            set: null
        };

        if (typeof lat === 'number' && typeof lon === 'number') {
            const obs = observer(lat, lon);
            // On part de minuit local pour obtenir le lever et le coucher du jour.
            const start = new Date(date.getTime());
            start.setHours(0, 0, 0, 0);
            const rise = AE.SearchRiseSet(AE.Body.Moon, obs, +1, start, 1);
            const set = AE.SearchRiseSet(AE.Body.Moon, obs, -1, start, 1);
            out.rise = rise ? rise.date : null;
            out.set = set ? set.date : null;
        }

        return out;
    }

    // Les `count` prochaines phases majeures après `from`, instants exacts.
    function nextPhases(from, count) {
        const out = [];
        let q = AE.SearchMoonQuarter(from);
        for (let i = 0; i < count; i++) {
            out.push({
                date: q.time.date,
                quarter: q.quarter,               // 0 NL, 1 PQ, 2 PL, 3 DQ
                name: QUARTER_NAMES[q.quarter],
                fraction: q.quarter * 0.25
            });
            q = AE.NextMoonQuarter(q);
        }
        return out;
    }

    // Prochaine occurrence d'un quartier donné (0 NL, 1 PQ, 2 PL, 3 DQ).
    function nextQuarter(from, quarter) {
        let q = AE.SearchMoonQuarter(from);
        for (let i = 0; i < 8; i++) {
            if (q.quarter === quarter) return q.time.date;
            q = AE.NextMoonQuarter(q);
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Tables de référence
    // ---------------------------------------------------------------------

    // Essaims de météores. Le maximum est repéré par la longitude écliptique du
    // Soleil, et non par une date fixe : c'est la convention de l'IMO, et elle
    // reste juste d'une année sur l'autre malgré les années bissextiles.
    // `dec` = déclinaison du radiant, qui sert à estimer sa hauteur au-dessus de
    // l'horizon depuis la latitude de l'utilisateur.
    const METEOR_SHOWERS = [
        { name: 'Quadrantides', sunLon: 283.15, zhr: 110, dec: 49.5 },
        { name: 'Lyrides', sunLon: 32.32, zhr: 18, dec: 34 },
        { name: 'Êta Aquarides', sunLon: 45.5, zhr: 50, dec: -1 },
        { name: 'Delta Aquarides', sunLon: 125, zhr: 25, dec: -16 },
        { name: 'Perséides', sunLon: 140.0, zhr: 100, dec: 58 },
        { name: 'Orionides', sunLon: 208, zhr: 20, dec: 16 },
        { name: 'Léonides', sunLon: 235.27, zhr: 15, dec: 22 },
        { name: 'Géminides', sunLon: 262.2, zhr: 150, dec: 33 },
        { name: 'Ursides', sunLon: 270.7, zhr: 10, dec: 76 }
    ];

    const INNER_PLANETS = [
        { body: AE.Body.Mercury, name: 'Mercure' },
        { body: AE.Body.Venus, name: 'Vénus' }
    ];
    const OUTER_PLANETS = [
        { body: AE.Body.Mars, name: 'Mars' },
        { body: AE.Body.Jupiter, name: 'Jupiter' },
        { body: AE.Body.Saturn, name: 'Saturne' }
    ];
    const ALL_PLANETS = INNER_PLANETS.concat(OUTER_PLANETS);

    // Seuils explicites, affichés à l'utilisateur pour qu'il sache ce qui est compté.
    const SUPERMOON_KM = 360000;   // pleine lune plus proche que ce seuil
    const MICROMOON_KM = 405000;   // pleine lune plus lointaine que ce seuil
    const CONJUNCTION_DEG = 3;     // séparation maximale pour annoncer un rapprochement
    const MEAN_MOON_KM = 384400;

    // ---------------------------------------------------------------------
    // Aides
    // ---------------------------------------------------------------------

    function altitudeOf(body, date, lat, lon) {
        const obs = observer(lat, lon);
        const eq = AE.Equator(body, date, obs, true, true);
        return AE.Horizon(date, obs, eq.ra, eq.dec, 'normal').altitude;
    }

    // Hauteur maximale approximative d'un point de déclinaison `dec` vu depuis la
    // latitude `lat`. Sert uniquement à dire si le radiant d'un essaim est bien placé.
    function maxAltitudeApprox(dec, lat) {
        return 90 - Math.abs(lat - dec);
    }

    // Séparation apparente entre deux corps, vue depuis la Terre.
    function separationDeg(a, b, date) {
        const va = AE.GeoVector(a, date, true);
        const vb = AE.GeoVector(b, date, true);
        const dot = (va.x * vb.x + va.y * vb.y + va.z * vb.z) / (va.Length() * vb.Length());
        return AE.RAD2DEG * Math.acos(Math.max(-1, Math.min(1, dot)));
    }

    const SOLAR_KIND_FR = { total: 'totale', annular: 'annulaire', partial: 'partielle', hybrid: 'hybride' };
    const LUNAR_KIND_FR = { total: 'totale', partial: 'partielle', penumbral: 'par la pénombre' };

    // ---------------------------------------------------------------------
    // Détection des événements
    // ---------------------------------------------------------------------

    function solarEclipses(from, to, lat, lon) {
        const out = [];
        const hasPos = typeof lat === 'number' && typeof lon === 'number';

        let g = AE.SearchGlobalSolarEclipse(from);
        let guard = 0;

        while (g && g.peak.date <= to && guard++ < 40) {
            const globalKind = SOLAR_KIND_FR[g.kind] || g.kind;
            let local = null;

            if (hasPos) {
                try {
                    // On cherche la prochaine éclipse visible depuis la position, et on
                    // ne la retient que si c'est bien la même que l'éclipse globale.
                    const l = AE.SearchLocalSolarEclipse(new Date(g.peak.date.getTime() - 2 * DAY_MS), observer(lat, lon));
                    if (Math.abs(l.peak.time.date - g.peak.date) < DAY_MS) local = l;
                } catch (e) { local = null; }
            }

            const visible = !!(local && local.obscuration > 0.001);
            let title, detail;

            if (visible) {
                // Le titre décrit ce que l'utilisateur verra de chez lui, pas ce que
                // verrait quelqu'un placé sous la bande de centralité.
                const localKind = SOLAR_KIND_FR[local.kind] || local.kind;
                title = 'Éclipse solaire ' + localKind;
                detail = 'Occultation maximale de ' + Math.round(local.obscuration * 100) + ' pour cent depuis chez vous. '
                    + 'Début à ' + hm(local.partial_begin.time.date)
                    + ', maximum à ' + hm(local.peak.time.date)
                    + ', fin à ' + hm(local.partial_end.time.date) + '. '
                    + 'Le Soleil sera à environ ' + Math.round(local.peak.altitude) + ' degrés au-dessus de l\'horizon, '
                    + 'prévoyez un horizon bien dégagé. '
                    + (localKind !== globalKind ? 'Ailleurs sur Terre, l\'éclipse est ' + globalKind + '. ' : '')
                    + 'Lunettes d\'éclipse certifiées ISO 12312-2 obligatoires : ne regardez jamais le Soleil à l\'œil nu, '
                    + 'ni à travers des lunettes de soleil ordinaires.';
            } else {
                title = 'Éclipse solaire ' + globalKind;
                detail = hasPos
                    ? 'Cette éclipse n\'est pas visible depuis votre position. Elle est ' + globalKind + ' ailleurs sur Terre.'
                    : 'Éclipse ' + globalKind + ' du Soleil. Indiquez votre position pour savoir si elle est visible de chez vous.';
            }

            out.push({
                id: 'sol-' + g.peak.date.toISOString().slice(0, 10),
                date: visible ? local.peak.time.date : g.peak.date,
                // Début du phénomène chez l'observateur, pour pouvoir le prévenir
                // avant que l'éclipse ne commence et non à son maximum.
                beginDate: visible ? local.partial_begin.time.date : null,
                type: 'eclipse-solar',
                category: 'Éclipse',
                icon: '\u{1F311}',
                title: title,
                detail: detail,
                visible: visible,
                importance: visible ? 3 : 1
            });

            g = AE.NextGlobalSolarEclipse(g.peak);
        }
        return out;
    }

    function lunarEclipses(from, to, lat, lon) {
        const out = [];
        const hasPos = typeof lat === 'number' && typeof lon === 'number';
        let e = AE.SearchLunarEclipse(from);
        let guard = 0;

        while (e && e.peak.date <= to && guard++ < 40) {
            const kind = LUNAR_KIND_FR[e.kind] || e.kind;
            let visible = false;
            let detail = 'Maximum à ' + hm(e.peak.date) + '.';

            if (e.kind === 'penumbral') {
                detail += ' La Lune ne traverse que la pénombre : l\'assombrissement est léger et difficile à percevoir.';
            }

            if (hasPos) {
                // Une éclipse de Lune n'est visible que si la Lune est levée au maximum.
                const alt = altitudeOf(AE.Body.Moon, e.peak.date, lat, lon);
                visible = alt > 0;
                detail += visible
                    ? ' La Lune est levée chez vous, à environ ' + Math.round(alt) + ' degrés au-dessus de l\'horizon. '
                      + 'Observable à l\'œil nu, sans aucune protection.'
                    : ' La Lune est sous l\'horizon chez vous à cet instant, l\'éclipse n\'est donc pas visible.';
            }

            out.push({
                id: 'lun-' + e.peak.date.toISOString().slice(0, 10),
                date: e.peak.date,
                type: 'eclipse-lunar',
                category: 'Éclipse',
                icon: '\u{1F312}',
                title: 'Éclipse de Lune ' + kind,
                detail: detail,
                visible: visible,
                importance: (visible && e.kind !== 'penumbral') ? 3 : 1
            });

            e = AE.NextLunarEclipse(e.peak);
        }
        return out;
    }

    function seasons(from, to) {
        const out = [];
        for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
            const s = AE.Seasons(y);
            const items = [
                { t: s.mar_equinox.date, title: 'Équinoxe de printemps', icon: '\u{1F331}', detail: 'Le jour et la nuit ont la même durée. Le Soleil traverse l\'équateur céleste vers le nord.' },
                { t: s.jun_solstice.date, title: 'Solstice d\'été', icon: '☀️', detail: 'Jour le plus long de l\'année dans l\'hémisphère nord, nuit la plus longue dans l\'hémisphère sud.' },
                { t: s.sep_equinox.date, title: 'Équinoxe d\'automne', icon: '\u{1F342}', detail: 'Le jour et la nuit ont la même durée. Le Soleil repasse au sud de l\'équateur céleste.' },
                { t: s.dec_solstice.date, title: 'Solstice d\'hiver', icon: '❄️', detail: 'Nuit la plus longue de l\'année dans l\'hémisphère nord, jour le plus long dans l\'hémisphère sud.' }
            ];
            for (const it of items) {
                if (it.t >= from && it.t <= to) {
                    out.push({
                        id: 'sea-' + it.t.toISOString().slice(0, 10),
                        date: it.t,
                        type: 'season',
                        category: 'Saison',
                        icon: it.icon,
                        title: it.title,
                        detail: it.detail + ' Instant exact : ' + hm(it.t) + '.',
                        visible: true,
                        importance: 1
                    });
                }
            }
        }
        return out;
    }

    // Super Lunes, Micro Lunes, lunes bleues et lunes noires : tout se déduit de la
    // liste des phases exactes, il n'y a aucune table à maintenir.
    function moonSpecials(from, to) {
        const out = [];
        const phases = [];
        let q = AE.SearchMoonQuarter(from);
        let guard = 0;

        while (q.time.date <= to && guard++ < 120) {
            phases.push({ date: q.time.date, quarter: q.quarter });
            q = AE.NextMoonQuarter(q);
        }

        // Comptage par mois calendaire, pour les lunes bleues et les lunes noires.
        const fullByMonth = {}, newByMonth = {};
        for (const p of phases) {
            const key = p.date.getFullYear() + '-' + p.date.getMonth();
            if (p.quarter === 2) (fullByMonth[key] = fullByMonth[key] || []).push(p);
            if (p.quarter === 0) (newByMonth[key] = newByMonth[key] || []).push(p);
        }

        const km = n => Math.round(n).toLocaleString('fr-CH');

        for (const p of phases) {
            const key = p.date.getFullYear() + '-' + p.date.getMonth();

            if (p.quarter === 2) {
                const dist = moonDistanceKm(p.date);

                if (dist < SUPERMOON_KM) {
                    out.push({
                        id: 'sup-' + p.date.toISOString().slice(0, 10),
                        date: p.date,
                        type: 'supermoon',
                        category: 'Lune',
                        icon: '\u{1F315}',
                        title: 'Super Lune',
                        detail: 'Pleine lune au voisinage du périgée, à ' + km(dist) + ' km. '
                            + 'Elle paraît environ ' + Math.round((MEAN_MOON_KM / dist - 1) * 100) + ' pour cent plus grande '
                            + 'qu\'une pleine lune de distance moyenne. '
                            + 'Critère retenu ici : moins de ' + km(SUPERMOON_KM) + ' km.',
                        visible: true,
                        importance: 2
                    });
                } else if (dist > MICROMOON_KM) {
                    out.push({
                        id: 'mic-' + p.date.toISOString().slice(0, 10),
                        date: p.date,
                        type: 'micromoon',
                        category: 'Lune',
                        icon: '\u{1F311}',
                        title: 'Micro Lune',
                        detail: 'Pleine lune au voisinage de l\'apogée, à ' + km(dist) + ' km. '
                            + 'C\'est la plus petite et la moins lumineuse des pleines lunes de l\'année. '
                            + 'Critère retenu ici : plus de ' + km(MICROMOON_KM) + ' km.',
                        visible: true,
                        importance: 1
                    });
                }

                if (fullByMonth[key] && fullByMonth[key].length > 1 && fullByMonth[key][1].date.getTime() === p.date.getTime()) {
                    out.push({
                        id: 'blu-' + p.date.toISOString().slice(0, 10),
                        date: p.date,
                        type: 'bluemoon',
                        category: 'Lune',
                        icon: '\u{1F535}',
                        title: 'Lune bleue',
                        detail: 'Deuxième pleine lune à l\'intérieur du même mois calendaire. '
                            + 'Elle n\'a rien de bleu : c\'est une curiosité de calendrier, qui revient tous les deux ans et demi environ.',
                        visible: true,
                        importance: 2
                    });
                }
            }

            if (p.quarter === 0 && newByMonth[key] && newByMonth[key].length > 1 && newByMonth[key][1].date.getTime() === p.date.getTime()) {
                out.push({
                    id: 'bla-' + p.date.toISOString().slice(0, 10),
                    date: p.date,
                    type: 'blackmoon',
                    category: 'Lune',
                    icon: '⚫',
                    title: 'Lune noire',
                    detail: 'Deuxième nouvelle lune à l\'intérieur du même mois calendaire. '
                        + 'Le ciel est alors particulièrement sombre, c\'est le meilleur moment du mois pour observer '
                        + 'les étoiles filantes et la Voie lactée.',
                    visible: true,
                    importance: 2
                });
            }
        }
        return out;
    }

    function meteorShowers(from, to, lat, lon) {
        const out = [];
        const hasPos = typeof lat === 'number' && typeof lon === 'number';

        for (let y = from.getUTCFullYear() - 1; y <= to.getUTCFullYear() + 1; y++) {
            for (const sh of METEOR_SHOWERS) {
                const t = AE.SearchSunLongitude(sh.sunLon, new Date(Date.UTC(y, 0, 1)), 400);
                if (!t) continue;
                const peak = t.date;
                if (peak < from || peak > to) continue;

                // La Lune est le facteur limitant numéro un : une pleine lune ruine
                // le maximum le plus riche.
                const illum = AE.Illumination(AE.Body.Moon, peak).phase_fraction;
                let verdict;
                if (illum < 0.25) {
                    verdict = 'Conditions excellentes, la Lune ne gênera pas.';
                } else if (illum < 0.55) {
                    verdict = 'Conditions correctes, avec une Lune éclairée à ' + Math.round(illum * 100) + ' pour cent.';
                } else {
                    verdict = 'Conditions médiocres : la Lune, éclairée à ' + Math.round(illum * 100) + ' pour cent, '
                        + 'noiera les météores les plus faibles.';
                }

                let placement = '';
                if (hasPos) {
                    const maxAlt = maxAltitudeApprox(sh.dec, lat);
                    if (maxAlt < 15) {
                        placement = ' Depuis votre latitude, le radiant reste très bas sur l\'horizon, l\'essaim sera peu favorable.';
                    } else if (maxAlt < 35) {
                        placement = ' Depuis votre latitude, le radiant monte peu, attendez-vous à un taux réduit.';
                    }
                }

                out.push({
                    id: 'met-' + peak.toISOString().slice(0, 10),
                    date: peak,
                    type: 'meteor',
                    category: 'Météores',
                    icon: '\u{1F320}',
                    title: 'Maximum des ' + sh.name,
                    detail: 'Jusqu\'à ' + sh.zhr + ' météores par heure dans des conditions idéales. '
                        + verdict + placement
                        + ' Le meilleur créneau se situe en général entre minuit et l\'aube, '
                        + 'loin des lumières de la ville, sans jumelles : l\'œil nu voit un bien plus grand champ.',
                    visible: true,
                    importance: sh.zhr >= 50 ? 2 : 1
                });
            }
        }
        return out;
    }

    function planetEvents(from, to) {
        const out = [];

        // Plus grande élongation de Mercure et Vénus : les seuls moments où ces deux
        // planètes s'écartent assez du Soleil pour être confortablement visibles.
        for (const p of INNER_PLANETS) {
            let e = AE.SearchMaxElongation(p.body, from);
            let guard = 0;
            while (e && e.time.date <= to && guard++ < 30) {
                const soir = e.visibility === 'evening';
                out.push({
                    id: 'elo-' + p.name + '-' + e.time.date.toISOString().slice(0, 10),
                    date: e.time.date,
                    type: 'planet',
                    category: 'Planète',
                    icon: '✨',
                    title: p.name + ', plus grande élongation',
                    detail: p.name + ' s\'écarte de ' + e.elongation.toFixed(0) + ' degrés du Soleil, '
                        + (soir
                            ? 'et devient visible le soir, vers l\'ouest, juste après le coucher du Soleil.'
                            : 'et devient visible le matin, vers l\'est, juste avant le lever du Soleil.')
                        + ' C\'est la meilleure période de la saison pour la repérer.',
                    visible: true,
                    importance: p.name === 'Mercure' ? 2 : 1
                });
                e = AE.SearchMaxElongation(p.body, new Date(e.time.date.getTime() + 10 * DAY_MS));
            }
        }

        // Oppositions des planètes extérieures. Attention : dans astronomy-engine, la
        // longitude relative est mesurée depuis le Soleil, donc l'opposition vaut 0
        // et non 180. Avec 180 on obtiendrait les conjonctions solaires, c'est à dire
        // très exactement les pires moments pour observer.
        for (const p of OUTER_PLANETS) {
            let t = AE.SearchRelativeLongitude(p.body, 0, from);
            let guard = 0;
            while (t && t.date <= to && guard++ < 10) {
                out.push({
                    id: 'opp-' + p.name + '-' + t.date.toISOString().slice(0, 10),
                    date: t.date,
                    type: 'planet',
                    category: 'Planète',
                    icon: '\u{1FA90}',
                    title: 'Opposition de ' + p.name,
                    detail: p.name + ' se trouve à l\'opposé du Soleil vu de la Terre, donc au plus près et au plus brillante. '
                        + 'Elle se lève au coucher du Soleil, culmine au milieu de la nuit et se couche à l\'aube. '
                        + 'C\'est le meilleur moment de l\'année pour l\'observer.',
                    visible: true,
                    importance: 2
                });
                t = AE.SearchRelativeLongitude(p.body, 0, new Date(t.date.getTime() + 30 * DAY_MS));
            }
        }

        // Rapprochements entre planètes : balayage journalier, on retient les minima
        // locaux de séparation qui passent sous le seuil.
        for (let i = 0; i < ALL_PLANETS.length; i++) {
            for (let j = i + 1; j < ALL_PLANETS.length; j++) {
                const a = ALL_PLANETS[i], b = ALL_PLANETS[j];
                let prev = null, prevPrev = null, prevDate = null;

                for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
                    const d = new Date(t);
                    const sep = separationDeg(a.body, b.body, d);

                    if (prevPrev !== null && prev < prevPrev && prev <= sep && prev < CONJUNCTION_DEG) {
                        out.push({
                            id: 'cnj-' + a.name + '-' + b.name + '-' + prevDate.toISOString().slice(0, 10),
                            date: prevDate,
                            type: 'conjunction',
                            category: 'Planète',
                            icon: '\u{1F31F}',
                            title: 'Rapprochement ' + a.name + ' et ' + b.name,
                            detail: a.name + ' et ' + b.name + ' se croisent à seulement ' + prev.toFixed(1) + ' degrés '
                                + 'l\'une de l\'autre, soit environ ' + Math.max(1, Math.round(prev / 0.5)) + ' fois le diamètre '
                                + 'apparent de la pleine lune. Très joli à l\'œil nu si l\'horizon est dégagé.',
                            visible: true,
                            importance: 2
                        });
                    }
                    prevPrev = prev;
                    prev = sep;
                    prevDate = d;
                }
            }
        }

        return out;
    }

    // ---------------------------------------------------------------------
    // Formatage
    // ---------------------------------------------------------------------

    let TZ = undefined;
    function setTimezone(tz) { TZ = tz || undefined; }

    function hm(d) {
        return new Date(d).toLocaleTimeString('fr-CH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    }
    function dayLabel(d) {
        return new Date(d).toLocaleDateString('fr-CH', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    }

    // ---------------------------------------------------------------------
    // API publique
    // ---------------------------------------------------------------------

    // Liste complète des événements sur une fenêtre donnée, triée par date.
    // `lat` et `lon` sont optionnels : sans position, les événements qui dépendent
    // du lieu (visibilité d'une éclipse, hauteur d'un radiant) restent génériques.
    function events(from, to, lat, lon) {
        const all = []
            .concat(solarEclipses(from, to, lat, lon))
            .concat(lunarEclipses(from, to, lat, lon))
            .concat(seasons(from, to))
            .concat(moonSpecials(from, to))
            .concat(meteorShowers(from, to, lat, lon))
            .concat(planetEvents(from, to));

        return all
            .filter(e => e.date >= from && e.date <= to)
            .sort((a, b) => a.date - b.date);
    }

    global.Astro = {
        ready: true,
        QUARTER_NAMES,
        SUPERMOON_KM,
        MICROMOON_KM,
        moonState,
        phaseFraction,
        moonDistanceKm,
        nextPhases,
        nextQuarter,
        events,
        setTimezone,
        hm,
        dayLabel
    };

})(typeof window !== 'undefined' ? window : globalThis);
