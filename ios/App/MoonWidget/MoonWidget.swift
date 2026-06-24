//
//  MoonWidget.swift
//  Widget d'écran d'accueil Moonlight — phase lunaire, illumination, compte à rebours.
//
//  Le calcul astronomique est porté À L'IDENTIQUE depuis script.js (web app) :
//  même mois synodique, même nouvelle lune de référence, même illumination,
//  même rendu de la lune (fonction drawMoon reproduite via un échantillonneur d'arcs SVG)
//  et le même libellé « J-X Pleine/Nouvelle Lune » que l'« Aperçu Widget » des réglages.
//

import WidgetKit
import SwiftUI

// MARK: - Astronomie (port exact de script.js)

enum Moon {
    static let synodicMonth = 29.53058867
    // 2000-01-06T12:24:00Z  ==  947161440 (epoch seconds)
    static let referenceNewMoon = Date(timeIntervalSince1970: 947_161_440)

    struct Data {
        let age: Double
        let phaseFraction: Double
        let illumination: Double
        let phaseName: String
    }

    static func data(for date: Date) -> Data {
        let diffDays = (date.timeIntervalSince1970 - referenceNewMoon.timeIntervalSince1970) / 86_400.0
        var age = diffDays.truncatingRemainder(dividingBy: synodicMonth)
        if age < 0 { age += synodicMonth }
        let phaseFraction = age / synodicMonth
        let illumination = 0.5 * (1 - cos(2 * .pi * phaseFraction))

        let name: String
        if phaseFraction < 0.02 || phaseFraction > 0.98 { name = "Nouvelle Lune" }
        else if phaseFraction < 0.24 { name = "Premier croissant" }
        else if phaseFraction < 0.26 { name = "Premier quartier" }
        else if phaseFraction < 0.49 { name = "Gibbeuse croissante" }
        else if phaseFraction < 0.51 { name = "Pleine Lune" }
        else if phaseFraction < 0.74 { name = "Gibbeuse décroissante" }
        else if phaseFraction < 0.76 { name = "Dernier quartier" }
        else { name = "Dernier croissant" }

        return Data(age: age, phaseFraction: phaseFraction, illumination: illumination, phaseName: name)
    }

    /// Prochaine date où la lune atteint `targetFraction` (0 = nouvelle, 0.5 = pleine).
    static func nextPhaseDate(_ targetFraction: Double, from start: Date) -> Date {
        let cur = data(for: start)
        let daysToAdd: Double
        if targetFraction > cur.phaseFraction {
            daysToAdd = (targetFraction - cur.phaseFraction) * synodicMonth
        } else {
            daysToAdd = (1 - cur.phaseFraction + targetFraction) * synodicMonth
        }
        return start.addingTimeInterval(daysToAdd * 86_400)
    }

    /// Reproduit le libellé du widget de l'app : « J-X Pleine Lune » ou « J-X Nouvelle Lune »
    /// pour l'événement (nouvelle/pleine) le plus proche.
    static func countdown(from now: Date) -> String {
        let nextNew = nextPhaseDate(0, from: now)
        let nextFull = nextPhaseDate(0.5, from: now)
        let diffNew = nextNew.timeIntervalSince(now)
        let diffFull = nextFull.timeIntervalSince(now)
        if diffNew < diffFull {
            let days = Int(floor(diffNew / 86_400))
            return "J-\(days) Nouvelle Lune"
        } else {
            let days = Int(floor(diffFull / 86_400))
            return "J-\(days) Pleine Lune"
        }
    }
}

// MARK: - Énergie du jour (port de MOOD_ADVICE / getGardenMood de script.js)

enum MoonEnergy {
    // Banque GÉNÉRÉE par scripts/gen_energy.mjs — NE PAS éditer à la main.
    // 8 phases (index = phaseIndex), sélection déterministe identique au web (script.js).
    static let library: [[String]] = [
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
        let key = "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)-\(idx)"
        let n = arr.count
        let i = ((Int(hash(key)) % n) + n) % n
        return arr[i]
    }
}

// MARK: - Rendu de la lune (port de drawMoon)

/// Échantillonne un arc elliptique SVG (rotation = 0) en segments de droite.
/// Implémentation de la conversion endpoint -> centre de la spec SVG.
private func appendSVGArc(to path: inout Path,
                          from p0: CGPoint, to p1: CGPoint,
                          rx rxIn: Double, ry ryIn: Double,
                          largeArc: Bool, sweep: Bool) {
    var rx = abs(rxIn)
    var ry = abs(ryIn)
    if rx < 0.0001 || ry < 0.0001 { path.addLine(to: p1); return }

    let x1p = (Double(p0.x) - Double(p1.x)) / 2.0
    let y1p = (Double(p0.y) - Double(p1.y)) / 2.0

    // Correction des rayons si trop petits.
    let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lambda > 1 {
        let s = sqrt(lambda)
        rx *= s
        ry *= s
    }

    let sign: Double = (largeArc != sweep) ? 1 : -1
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    if num < 0 { num = 0 }
    let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    let coef = sign * (den == 0 ? 0 : sqrt(num / den))
    let cxp = coef * (rx * y1p / ry)
    let cyp = coef * (-ry * x1p / rx)
    let cx = cxp + (Double(p0.x) + Double(p1.x)) / 2.0
    let cy = cyp + (Double(p0.y) + Double(p1.y)) / 2.0

    func vecAngle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
        let dot = ux * vx + uy * vy
        let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
        var a = acos(max(-1, min(1, len == 0 ? 1 : dot / len)))
        if (ux * vy - uy * vx) < 0 { a = -a }
        return a
    }

    let ux = (x1p - cxp) / rx
    let uy = (y1p - cyp) / ry
    let vx = (-x1p - cxp) / rx
    let vy = (-y1p - cyp) / ry
    let theta1 = vecAngle(1, 0, ux, uy)
    var dtheta = vecAngle(ux, uy, vx, vy)
    if !sweep && dtheta > 0 { dtheta -= 2 * .pi }
    if sweep && dtheta < 0 { dtheta += 2 * .pi }

    let steps = 60
    for i in 1...steps {
        let t = theta1 + dtheta * Double(i) / Double(steps)
        let x = cx + rx * cos(t)
        let y = cy + ry * sin(t)
        path.addLine(to: CGPoint(x: x, y: y))
    }
}

/// Forme de la PARTIE ÉCLAIRÉE de la lune, dans un espace 100×100 (cx=50, cy=50, r=48),
/// mise à l'échelle dans `rect`. Logique identique à drawMoon(phaseFraction, hemisphere).
struct MoonLitShape: Shape {
    var phaseFraction: Double
    var isNorth: Bool = true

    func path(in rect: CGRect) -> Path {
        let r = 48.0, cx = 50.0, cy = 50.0
        var p = Path()
        let f = phaseFraction

        if f < 0.01 || f > 0.99 {
            // Nouvelle lune : aucune zone éclairée.
        } else if f > 0.49 && f < 0.51 {
            // Pleine lune : disque entier.
            p.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
        } else {
            var termRx = abs(cos(f * 2 * .pi)) * r
            if termRx < 0.1 { termRx = 0.1 }

            let lightSideRight: Bool
            let sweepTerm: Bool
            if isNorth {
                lightSideRight = f < 0.5
                sweepTerm = (f < 0.25 || (f >= 0.5 && f < 0.75)) ? false : true
            } else {
                lightSideRight = f >= 0.5
                sweepTerm = (f < 0.25 || (f >= 0.5 && f < 0.75)) ? true : false
            }

            let top = CGPoint(x: cx, y: cy - r)
            let bottom = CGPoint(x: cx, y: cy + r)
            p.move(to: top)
            // Limbe : demi-cercle complet (sweep = côté éclairé).
            appendSVGArc(to: &p, from: top, to: bottom, rx: r, ry: r, largeArc: false, sweep: lightSideRight)
            // Terminateur : demi-ellipse de retour.
            appendSVGArc(to: &p, from: bottom, to: top, rx: termRx, ry: r, largeArc: false, sweep: sweepTerm)
            p.closeSubpath()
        }

        let scale = min(rect.width, rect.height) / 100.0
        let tx = rect.midX - 50 * scale
        let ty = rect.midY - 50 * scale
        let transform = CGAffineTransform(scaleX: scale, y: scale)
            .concatenating(CGAffineTransform(translationX: tx, y: ty))
        return p.applying(transform)
    }
}

/// Vue lune : sphère ombrée + partie éclairée dégradée + halo.
struct MoonView: View {
    var phaseFraction: Double
    var isNorth: Bool = true
    var body: some View {
        GeometryReader { geo in
            let d = min(geo.size.width, geo.size.height)
            ZStack {
                // Halo lumineux
                Circle()
                    .fill(Color(red: 0.62, green: 0.69, blue: 0.96))
                    .opacity(0.20)
                    .blur(radius: d * 0.11)
                    .scaleEffect(1.07)
                // Sphère sombre (ombre / lumière cendrée) pour un rendu volumétrique
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color(red: 0.22, green: 0.24, blue: 0.31),
                                     Color(red: 0.09, green: 0.10, blue: 0.14)],
                            center: UnitPoint(x: 0.36, y: 0.34),
                            startRadius: d * 0.02,
                            endRadius: d * 0.64
                        )
                    )
                // Partie éclairée, légèrement dégradée (blanc chaud -> bleuté)
                MoonLitShape(phaseFraction: phaseFraction, isNorth: isNorth)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 1.0, green: 0.99, blue: 0.95),
                                     Color(red: 0.84, green: 0.87, blue: 0.97)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                // Liseré du limbe
                Circle().stroke(Color.white.opacity(0.16), lineWidth: max(0.6, d * 0.012))
            }
            .frame(width: d, height: d)
        }
    }
}

/// Lune simplifiée, lisible en monochrome (widgets d'écran verrouillé).
struct MoonGlyph: View {
    var phaseFraction: Double
    var isNorth: Bool = true
    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.14))
            MoonLitShape(phaseFraction: phaseFraction, isNorth: isNorth).fill(Color.white)
            Circle().stroke(Color.white.opacity(0.55), lineWidth: 1)
        }
    }
}

// MARK: - Timeline

struct MoonEntry: TimelineEntry {
    let date: Date
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> MoonEntry { MoonEntry(date: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (MoonEntry) -> Void) {
        completion(MoonEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MoonEntry>) -> Void) {
        var entries: [MoonEntry] = []
        let now = Date()
        let cal = Calendar.current
        // Une entrée toutes les 3 h sur 24 h pour garder le compte à rebours frais.
        for hour in stride(from: 0, to: 24, by: 3) {
            if let d = cal.date(byAdding: .hour, value: hour, to: now) {
                entries.append(MoonEntry(date: d))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Fond compatible iOS 15/16/17+

/// Champ d'étoiles discret (positions fixes, déterministes).
private struct StarField: View {
    static let stars: [(x: CGFloat, y: CGFloat, s: CGFloat, o: Double)] = [
        (0.10, 0.16, 1.5, 0.55), (0.84, 0.10, 1.1, 0.45), (0.67, 0.24, 1.7, 0.60),
        (0.20, 0.74, 1.2, 0.40), (0.91, 0.58, 1.4, 0.50), (0.50, 0.06, 1.0, 0.35),
        (0.78, 0.84, 1.6, 0.50), (0.34, 0.40, 0.9, 0.30), (0.06, 0.54, 1.3, 0.45),
        (0.96, 0.32, 1.0, 0.35), (0.44, 0.92, 1.1, 0.40), (0.60, 0.68, 0.9, 0.30),
        (0.28, 0.20, 0.8, 0.30), (0.72, 0.46, 1.0, 0.35)
    ]
    var body: some View {
        GeometryReader { g in
            ForEach(0..<StarField.stars.count, id: \.self) { i in
                let st = StarField.stars[i]
                Circle()
                    .fill(Color.white.opacity(st.o))
                    .frame(width: st.s, height: st.s)
                    .position(x: st.x * g.size.width, y: st.y * g.size.height)
            }
        }
    }
}

/// Fond du widget : dégradé bleu nuit + étoiles.
private struct BackgroundView: View {
    var body: some View {
        ZStack {
            RadialGradient(
                colors: [Color(red: 0.09, green: 0.11, blue: 0.18),
                         Color(red: 0.03, green: 0.035, blue: 0.06)],
                center: .top, startRadius: 0, endRadius: 380
            )
            StarField()
        }
    }
}

/// Fond : dégradé + étoiles sur l'écran d'accueil ; transparent/accessoire sur l'écran verrouillé.
private struct WidgetBG: ViewModifier {
    var family: WidgetFamily
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) { bg }
        } else {
            content.background(bg)
        }
    }
    @ViewBuilder private var bg: some View {
        if #available(iOS 16.0, *), family == .accessoryCircular {
            AccessoryWidgetBackground()
        } else if #available(iOS 16.0, *),
                  family == .accessoryRectangular || family == .accessoryInline {
            Color.clear
        } else {
            BackgroundView()
        }
    }
}

// MARK: - Vues du widget

struct MoonWidgetEntryView: View {
    var entry: MoonEntry
    @Environment(\.widgetFamily) var family

    private let secondary = Color(white: 0.70)

    private var data: Moon.Data { Moon.data(for: entry.date) }
    private var illumPct: Int { Int((data.illumination * 100).rounded()) }
    private var countdown: String { Moon.countdown(from: entry.date) }
    private var energy: String { MoonEnergy.ofDay(phaseFraction: data.phaseFraction, date: entry.date) }

    var body: some View {
        content.modifier(WidgetBG(family: family))
    }

    @ViewBuilder private var content: some View {
        if #available(iOS 16.0, *),
           family == .accessoryRectangular || family == .accessoryCircular || family == .accessoryInline {
            accessoryContent
        } else {
            systemContent
        }
    }

    // MARK: Écran d'accueil

    @ViewBuilder private var systemContent: some View {
        switch family {
        case .systemLarge:
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 18) {
                    MoonView(phaseFraction: data.phaseFraction)
                        .frame(width: 96, height: 96)
                    VStack(alignment: .leading, spacing: 7) {
                        Text(data.phaseName)
                            .font(.system(size: 21, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text("\(illumPct)% éclairée")
                            .font(.system(size: 14))
                            .foregroundColor(secondary)
                        Text(countdown)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 0)
                }
                Rectangle().fill(Color.white.opacity(0.10)).frame(height: 1)
                VStack(alignment: .leading, spacing: 7) {
                    Text("ÉNERGIE DU JOUR")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .foregroundColor(secondary)
                    Text(energy)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .systemMedium:
            HStack(spacing: 16) {
                VStack(spacing: 6) {
                    MoonView(phaseFraction: data.phaseFraction)
                        .frame(width: 74, height: 74)
                    Text("\(illumPct)%")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(data.phaseName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(countdown)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(secondary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Text(energy)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.75)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
        default: // .systemSmall — lune centrée, % en haut à gauche, énergie dessous
            VStack(spacing: 8) {
                MoonView(phaseFraction: data.phaseFraction)
                    .frame(width: 52, height: 52)
                Text(energy)
                    .font(.system(size: 10.5, weight: .medium))
                    .foregroundColor(secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                    .minimumScaleFactor(0.6)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .topLeading) {
                Text("\(illumPct)%")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: Écran verrouillé (iOS 16+)

    @available(iOS 16.0, *)
    @ViewBuilder private var accessoryContent: some View {
        switch family {
        case .accessoryCircular:
            MoonGlyph(phaseFraction: data.phaseFraction)
                .padding(3)
                .widgetAccentable()
        case .accessoryInline:
            Text("\(data.phaseName) · \(illumPct)%")
        case .accessoryRectangular:
            HStack(spacing: 8) {
                MoonGlyph(phaseFraction: data.phaseFraction)
                    .frame(width: 26, height: 26)
                    .widgetAccentable()
                VStack(alignment: .leading, spacing: 1) {
                    Text(data.phaseName)
                        .font(.headline)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(energy)
                        .font(.caption2)
                        .lineLimit(2).minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
        default:
            EmptyView()
        }
    }
}

// MARK: - Déclaration du widget

struct MoonWidget: Widget {
    let kind: String = "MoonWidget"

    static var families: [WidgetFamily] {
        var f: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]
        if #available(iOS 16.0, *) {
            f.append(contentsOf: [.accessoryRectangular, .accessoryCircular, .accessoryInline])
        }
        return f
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            MoonWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Phase lunaire")
        .description("La phase de la Lune, son illumination, le compte à rebours et l'énergie du jour.")
        .supportedFamilies(MoonWidget.families)
    }
}

@main
struct MoonWidgetBundle: WidgetBundle {
    var body: some Widget {
        MoonWidget()
    }
}
