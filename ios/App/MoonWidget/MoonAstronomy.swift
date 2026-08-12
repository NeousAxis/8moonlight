//
//  MoonAstronomy.swift
//  Calcul lunaire du widget Moonlight.
//
//  Remplace le modele synodique moyen utilise jusqu'ici, qui ignorait
//  l'excentricite de l'orbite lunaire : il se trompait de 6,6 h en moyenne et
//  jusqu'a 11,6 h sur l'instant d'une pleine ou nouvelle lune, ce qui faisait
//  afficher au widget un libelle « J-X » faux 150 jours sur 365.
//
//  Methode : longitudes ecliptiques geometriques du Soleil (Meeus chapitre 25)
//  et de la Lune (Meeus chapitre 47, serie complete de la table 47.A), puis
//  recherche de l'instant ou leur elongation atteint la valeur voulue. La
//  nouvelle lune est par definition l'elongation nulle, la pleine lune 180
//  degres : chercher la racine, c'est appliquer la definition, il n'y a aucune
//  table de dates a maintenir.
//
//  Aucune dependance a UIKit ni WidgetKit : ce fichier se compile seul, ce qui
//  permet de le confronter directement au moteur astronomique de l'app.
//

import Foundation

enum Moon {

    // Duree moyenne d'une lunaison. Ne sert plus qu'a estimer un point de depart
    // pour la recherche et a convertir une fraction de cycle en jours.
    static let synodicMonth = 29.53058867

    struct Data {
        let age: Double
        let phaseFraction: Double
        let illumination: Double
        let phaseName: String
    }

    // MARK: - Utilitaires

    private static func rad(_ degrees: Double) -> Double { degrees * .pi / 180 }

    private static func norm360(_ degrees: Double) -> Double {
        let x = degrees.truncatingRemainder(dividingBy: 360)
        return x < 0 ? x + 360 : x
    }

    /// Ramene un ecart d'angle dans [-180, 180), pour que la recherche sache de
    /// quel cote de l'evenement elle se trouve.
    private static func signedDelta(_ degrees: Double) -> Double {
        var x = norm360(degrees)
        if x >= 180 { x -= 360 }
        return x
    }

    private static func julianDay(_ date: Date) -> Double {
        date.timeIntervalSince1970 / 86_400.0 + 2_440_587.5
    }

    private static func date(fromJulianDay jd: Double) -> Date {
        Date(timeIntervalSince1970: (jd - 2_440_587.5) * 86_400.0)
    }

    private static func centuries(_ jd: Double) -> Double {
        (jd - 2_451_545.0) / 36_525.0
    }

    // MARK: - Longitude du Soleil (Meeus chapitre 25)

    static func sunLongitude(julianDay jd: Double) -> Double {
        let t = centuries(jd)

        let l0 = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t
        let m = 357.52911 + 35_999.05029 * t - 0.0001537 * t * t

        let mr = rad(m)
        let c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(mr)
            + (0.019993 - 0.000101 * t) * sin(2 * mr)
            + 0.000289 * sin(3 * mr)

        // Longitude apparente : aberration de la lumiere solaire. La nutation
        // n'est pas appliquee, elle affecte identiquement le Soleil et la Lune
        // et disparait donc de leur difference.
        return norm360(l0 + c - 0.00569)
    }

    // MARK: - Longitude de la Lune (Meeus chapitre 47, table 47.A)

    /// Table 47.A complete : arguments (D, M, M', F) et coefficient en 1e-6 degre.
    private static let lunarTerms: [(Int, Int, Int, Int, Double)] = [
        (0, 0, 1, 0, 6_288_774), (2, 0, -1, 0, 1_274_027), (2, 0, 0, 0, 658_314),
        (0, 0, 2, 0, 213_618), (0, 1, 0, 0, -185_116), (0, 0, 0, 2, -114_332),
        (2, 0, -2, 0, 58_793), (2, -1, -1, 0, 57_066), (2, 0, 1, 0, 53_322),
        (2, -1, 0, 0, 45_758), (0, 1, -1, 0, -40_923), (1, 0, 0, 0, -34_720),
        (0, 1, 1, 0, -30_383), (2, 0, 0, -2, 15_327), (0, 0, 1, 2, -12_528),
        (0, 0, 1, -2, 10_980), (4, 0, -1, 0, 10_675), (0, 0, 3, 0, 10_034),
        (4, 0, -2, 0, 8_548), (2, 1, -1, 0, -7_888), (2, 1, 0, 0, -6_766),
        (1, 0, -1, 0, -5_163), (1, 1, 0, 0, 4_987), (2, -1, 1, 0, 4_036),
        (2, 0, 2, 0, 3_994), (4, 0, 0, 0, 3_861), (2, 0, -3, 0, 3_665),
        (0, 1, -2, 0, -2_689), (2, 0, -1, 2, -2_602), (2, -1, -2, 0, 2_390),
        (1, 0, 1, 0, -2_348), (2, -2, 0, 0, 2_236), (0, 1, 2, 0, -2_120),
        (0, 2, 0, 0, -2_069), (2, -2, -1, 0, 2_048), (2, 0, 1, -2, -1_773),
        (2, 0, 0, 2, -1_595), (4, -1, -1, 0, 1_215), (0, 0, 2, 2, -1_110),
        (3, 0, -1, 0, -892), (2, 1, 1, 0, -810), (4, -1, -2, 0, 759),
        (0, 2, -1, 0, -713), (2, 2, -1, 0, -700), (2, 1, -2, 0, 691),
        (2, -1, 0, -2, 596), (4, 0, 1, 0, 549), (0, 0, 4, 0, 537),
        (4, -1, 0, 0, 520), (1, 0, -2, 0, -487), (2, 1, 0, -2, -399),
        (0, 0, 2, -2, -381), (1, 1, 1, 0, 351), (3, 0, -2, 0, -340),
        (4, 0, -3, 0, 330), (2, -1, 2, 0, 327), (0, 2, 1, 0, -323),
        (1, 1, -1, 0, 299), (2, 0, 3, 0, 294)
    ]

    static func moonLongitude(julianDay jd: Double) -> Double {
        let t = centuries(jd)
        let t2 = t * t, t3 = t2 * t, t4 = t3 * t

        // Longitude moyenne de la Lune
        let lp = 218.3164477 + 481_267.88123421 * t - 0.0015786 * t2 + t3 / 538_841 - t4 / 65_194_000
        // Elongation moyenne
        let d = 297.8501921 + 445_267.1114034 * t - 0.0018819 * t2 + t3 / 545_868 - t4 / 113_065_000
        // Anomalie moyenne du Soleil
        let m = 357.5291092 + 35_999.0502909 * t - 0.0001536 * t2 + t3 / 24_490_000
        // Anomalie moyenne de la Lune
        let mp = 134.9633964 + 477_198.8675055 * t + 0.0087414 * t2 + t3 / 69_699 - t4 / 14_712_000
        // Argument de latitude
        let f = 93.2720950 + 483_202.0175233 * t - 0.0036539 * t2 - t3 / 3_526_000 + t4 / 863_310_000

        // Correction d'excentricite de l'orbite terrestre : les termes qui
        // dependent de l'anomalie solaire doivent en etre affectes.
        let e = 1 - 0.002516 * t - 0.0000074 * t2

        var sigma = 0.0
        for (cd, cm, cmp, cf, coeff) in lunarTerms {
            let arg = rad(Double(cd) * d + Double(cm) * m + Double(cmp) * mp + Double(cf) * f)
            var value = coeff * sin(arg)
            switch abs(cm) {
            case 1: value *= e
            case 2: value *= e * e
            default: break
            }
            sigma += value
        }

        // Termes additifs dus a Venus et a Jupiter, et a l'aplatissement terrestre.
        let a1 = 119.75 + 131.849 * t
        let a2 = 53.09 + 479_264.290 * t
        sigma += 3_958 * sin(rad(a1))
        sigma += 1_962 * sin(rad(lp - f))
        sigma += 318 * sin(rad(a2))

        return norm360(lp + sigma / 1_000_000)
    }

    // MARK: - Elongation et phase

    /// Ecart de longitude Lune moins Soleil, en degres. 0 = nouvelle lune,
    /// 90 = premier quartier, 180 = pleine lune, 270 = dernier quartier.
    static func elongation(at date: Date) -> Double {
        let jd = julianDay(date)
        return norm360(moonLongitude(julianDay: jd) - sunLongitude(julianDay: jd))
    }

    static func data(for date: Date) -> Data {
        let elong = elongation(at: date)
        let phaseFraction = elong / 360
        let illumination = 0.5 * (1 - cos(rad(elong)))

        // Age reel : temps ecoule depuis la nouvelle lune precedente, et non une
        // fraction du mois synodique moyen.
        let previousNew = previousPhaseDate(0, before: date)
        let age = date.timeIntervalSince(previousNew) / 86_400.0

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

    // MARK: - Recherche des instants de phase

    // Vitesse moyenne d'accroissement de l'elongation, en degres par jour.
    private static let elongationRate = 360.0 / synodicMonth

    /// Affine par iterations l'instant ou l'elongation vaut `targetDegrees`,
    /// en partant de `seed`. La derivee reelle ne s'ecarte que de quelques pour
    /// cent de la valeur moyenne, la convergence est donc immediate.
    private static func refine(_ targetDegrees: Double, seed: Date) -> Date {
        var t = seed
        for _ in 0..<30 {
            let delta = signedDelta(elongation(at: t) - targetDegrees)
            let step = -delta / elongationRate * 86_400.0
            t = t.addingTimeInterval(step)
            if abs(step) < 0.5 { break }   // une demi-seconde
        }
        return t
    }

    /// Prochain instant, strictement apres `start`, ou la lune atteint
    /// `targetFraction` (0 = nouvelle, 0.25 = premier quartier, 0.5 = pleine).
    static func nextPhaseDate(_ targetFraction: Double, from start: Date) -> Date {
        let target = norm360(targetFraction * 360)
        let delta = signedDelta(elongation(at: start) - target)

        // Si l'evenement vient de passer, delta est positif et l'estimation
        // tomberait avant `start` : on vise alors la lunaison suivante.
        var seed = start.addingTimeInterval(-delta / elongationRate * 86_400.0)
        if seed <= start { seed = seed.addingTimeInterval(synodicMonth * 86_400.0) }

        var result = refine(target, seed: seed)
        if result <= start {
            result = refine(target, seed: result.addingTimeInterval(synodicMonth * 86_400.0))
        }
        return result
    }

    /// Dernier instant, strictement avant `date`, ou la lune atteignait `targetFraction`.
    static func previousPhaseDate(_ targetFraction: Double, before date: Date) -> Date {
        let target = norm360(targetFraction * 360)
        let delta = signedDelta(elongation(at: date) - target)

        var seed = date.addingTimeInterval(-delta / elongationRate * 86_400.0)
        if seed >= date { seed = seed.addingTimeInterval(-synodicMonth * 86_400.0) }

        var result = refine(target, seed: seed)
        if result >= date {
            result = refine(target, seed: result.addingTimeInterval(-synodicMonth * 86_400.0))
        }
        return result
    }

    /// Libelle « J-X Pleine Lune » ou « J-X Nouvelle Lune » pour l'evenement le
    /// plus proche, identique a celui de l'app.
    static func countdown(from now: Date) -> String {
        let nextNew = nextPhaseDate(0, from: now)
        let nextFull = nextPhaseDate(0.5, from: now)
        let diffNew = nextNew.timeIntervalSince(now)
        let diffFull = nextFull.timeIntervalSince(now)

        if diffNew < diffFull {
            return "J-\(Int(floor(diffNew / 86_400))) Nouvelle Lune"
        } else {
            return "J-\(Int(floor(diffFull / 86_400))) Pleine Lune"
        }
    }
}
