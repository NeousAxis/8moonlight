// Génère la banque « Énergie du jour » + l'algo de sélection déterministe,
// et l'INJECTE à la fois dans le widget natif (ios/App/MoonWidget/MoonWidget.swift)
// et dans l'app web (script.js). SOURCE UNIQUE -> app et widget toujours cohérents.
//
// Sélection : hash(`${année}-${mois}-${jour}-${phaseIndex}`) -> index dans la banque
//   - stable toute la journée
//   - différente chaque mois (le mois entre dans le hash)
//   - 8 phases réelles (mêmes seuils que getMoonData / phaseName)
//
// Lancer :  node scripts/gen_energy.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 8 phases, ordre = phaseIndex 0..7
//  0 Nouvelle · 1 Premier croissant · 2 Premier quartier · 3 Gibbeuse croissante
//  4 Pleine · 5 Gibbeuse décroissante · 6 Dernier quartier · 7 Dernier croissant
const PHRASES = [
  [ // 0 — Nouvelle Lune : commencements, intentions, silence, graine dans le noir
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
    "🌑 Premier jour d'un nouveau rêve. Que veux-tu appeler à toi ?"
  ],
  [ // 1 — Premier croissant : émergence, premiers pas, fragilité, foi
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
    "🌅 Le jour se lève sur ton projet. Continue."
  ],
  [ // 2 — Premier quartier : décision, action, obstacles, engagement
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
    "🏹 Vise, tends l'arc, lâche."
  ],
  [ // 3 — Gibbeuse croissante : affiner, patienter, peaufiner, presque
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
    "✨ Tu es plus proche que tu ne crois. Continue."
  ],
  [ // 4 — Pleine Lune : apogée, lumière, émotions, gratitude, révélation
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
    "🌝 Lève les yeux : la beauté te répond."
  ],
  [ // 5 — Gibbeuse décroissante : partage, gratitude, transmettre, récolte
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
    "💝 Ta générosité revient toujours, autrement."
  ],
  [ // 6 — Dernier quartier : lâcher-prise, tri, pardon, nettoyage
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
    "🌙 Range le passé pour rêver le futur."
  ],
  [ // 7 — Dernier croissant : repos, retrait, guérison, rêver, clôture
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
    "🌑 Bientôt la nouvelle lune. Prépare ton vœu."
  ]
];

// --- Validation ---
if (PHRASES.length !== 8) throw new Error('Il faut 8 phases');
PHRASES.forEach((a, i) => { if (a.length < 1) throw new Error(`Phase ${i} vide`); });
console.log('Comptes par phase:', PHRASES.map(a => a.length).join(', '));
console.log('Total phrases:', PHRASES.reduce((s, a) => s + a.length, 0));

const q = (s) => JSON.stringify(s); // littéral sûr pour JS ET Swift

// --- Génère le bloc Swift (enum MoonEnergy) ---
function swiftEnum() {
  const arrays = PHRASES.map((arr, idx) => {
    const items = arr.map(s => `            ${q(s)},`).join('\n');
    return `        [ // ${idx}\n${items}\n        ],`;
  }).join('\n');
  return `enum MoonEnergy {
    // Banque GÉNÉRÉE par scripts/gen_energy.mjs — NE PAS éditer à la main.
    // 8 phases (index = phaseIndex), sélection déterministe identique au web (script.js).
    static let library: [[String]] = [
${arrays}
    ]

    static func phaseIndex(_ pf: Double) -> Int {
        if pf < 0.02 || pf > 0.98 { return 0 }
        if pf < 0.24 { return 1 }
        if pf < 0.26 { return 2 }
        if pf < 0.49 { return 3 }
        if pf < 0.51 { return 4 }
        if pf < 0.74 { return 5 }
        if pf < 0.76 { return 6 }
        return 7
    }

    // Hash 32 bits identique à Math.imul(h,31)+c | 0 côté JS.
    static func hash(_ s: String) -> Int32 {
        var h: Int32 = 0
        for u in s.utf16 { h = h &* 31 &+ Int32(u) }
        return h
    }

    /// Énergie du jour : stable sur la journée, différente chaque mois.
    static func ofDay(phaseFraction pf: Double, date: Date) -> String {
        let idx = phaseIndex(pf)
        let arr = library[idx]
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        let key = "\\(c.year ?? 0)-\\(c.month ?? 0)-\\(c.day ?? 0)-\\(idx)"
        let n = arr.count
        let i = ((Int(hash(key)) % n) + n) % n
        return arr[i]
    }
}`;
}

// --- Génère le bloc JS (ENERGY_LIB + helpers) ---
function jsBlock() {
  const arrays = PHRASES.map((arr, idx) => {
    const items = arr.map(s => `        ${q(s)},`).join('\n');
    return `    [ // ${idx}\n${items}\n    ],`;
  }).join('\n');
  return `// Banque « Énergie du jour » GÉNÉRÉE par scripts/gen_energy.mjs — NE PAS éditer à la main.
// 8 phases, sélection déterministe identique au widget natif (MoonWidget.swift).
const ENERGY_LIB = [
${arrays}
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
    const key = \`\${d.getFullYear()}-\${d.getMonth() + 1}-\${d.getDate()}-\${idx}\`;
    const n = arr.length;
    const i = ((energyHash(key) % n) + n) % n;
    return arr[i];
}`;
}

// --- Remplace `enum MoonEnergy { ... }` (brace-match) dans le fichier Swift ---
function patchSwift() {
  const path = join(ROOT, 'ios/App/MoonWidget/MoonWidget.swift');
  let c = readFileSync(path, 'utf8');
  const start = c.indexOf('enum MoonEnergy {');
  if (start < 0) throw new Error('enum MoonEnergy introuvable');
  let i = c.indexOf('{', start), depth = 0, end = -1;
  for (; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('accolade fermante de MoonEnergy introuvable');
  c = c.slice(0, start) + swiftEnum() + c.slice(end);
  writeFileSync(path, c);
  console.log('Patché:', path);
}

// --- Remplace MOOD_ADVICE + le bloc mood dans script.js ---
function patchJS() {
  const path = join(ROOT, 'script.js');
  let c = readFileSync(path, 'utf8');

  // a) const MOOD_ADVICE = { ... };  -> bloc ENERGY_LIB + helpers
  const ms = c.indexOf('const MOOD_ADVICE = {');
  if (ms < 0) throw new Error('MOOD_ADVICE introuvable');
  let i = c.indexOf('{', ms), depth = 0, me = -1;
  for (; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) { me = i + 1; break; } }
  }
  // inclure le ';' qui suit
  while (me < c.length && c[me] !== ';') me++;
  me++; // après le ';'
  c = c.slice(0, ms) + jsBlock() + c.slice(me);

  // b) bloc "// Mood ... " -> appel energyOfDay
  const a1 = c.indexOf('    // Mood');
  const a2 = c.indexOf('    return { garden:', a1);
  if (a1 < 0 || a2 < 0) throw new Error('bloc mood / return introuvable');
  const replacement = '    // Énergie du jour (banque générée, déterministe : stable/jour, variable/mois)\n    const mood = energyOfDay(phaseFraction, targetDate);\n\n';
  c = c.slice(0, a1) + replacement + c.slice(a2);

  writeFileSync(path, c);
  console.log('Patché:', path);
}

// --- Scripts de vérif croisée JS<->Swift (matrice idx/dates -> index i) ---
function writeCrossChecks() {
  const matrix = `
const Y=[2026,2027,2028], M=Array.from({length:12},(_,k)=>k+1), D=[1,5,9,14,19,23,28,31];
let out=[];
for(const idx of [0,1,2,3,4,5,6,7]) for(const y of Y) for(const m of M) for(const d of D){
  const key=\`\${y}-\${m}-\${d}-\${idx}\`; const n=ENERGY_LIB[idx].length;
  const i=((energyHash(key)%n)+n)%n;
  out.push(\`\${y} \${m} \${d} \${idx} \${i}\`);
}
console.log(out.join("\\n"));
`;
  writeFileSync('/tmp/echk.js', jsBlock() + '\n' + matrix);

  const swiftMatrix = `
let Y=[2026,2027,2028]; let M=Array(1...12); let D=[1,5,9,14,19,23,28,31]
var out:[String]=[]
for idx in [0,1,2,3,4,5,6,7] { for y in Y { for m in M { for d in D {
  let key="\\(y)-\\(m)-\\(d)-\\(idx)"; let n=MoonEnergy.library[idx].count
  let i=((Int(MoonEnergy.hash(key)) % n) + n) % n
  out.append("\\(y) \\(m) \\(d) \\(idx) \\(i)")
}}}}
print(out.joined(separator:"\\n"))
`;
  // Swift autonome : enum + Foundation
  writeFileSync('/tmp/echk.swift', 'import Foundation\n' + swiftEnum() + '\n' + swiftMatrix);
  console.log('Vérifs écrites: /tmp/echk.js /tmp/echk.swift');
}

patchSwift();
patchJS();
writeCrossChecks();

// JSON de référence
writeFileSync(join(ROOT, 'scripts/energy_phrases.json'), JSON.stringify(PHRASES, null, 2));
console.log('OK.');
