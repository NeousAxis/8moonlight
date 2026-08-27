# Journal des Déploiements (Changelog & Procédures)

Ce fichier documente les changements majeurs de l'application Moonlight ainsi que les bonnes pratiques à respecter lors d'une mise en production.

## 🚀 Procédure de Mise en Production (PWA)

**IMPORTANT :** Moonlight est une PWA (Progressive Web App). Pour que les navigateurs et les téléphones des utilisateurs téléchargent la dernière version de l'application après une modification de code, il est **obligatoire** de forcer la mise à jour du cache de leur appareil.

### Étapes à suivre pour chaque déploiement :
1. Effectuez vos modifications dans les fichiers (ex: `script.js`, `index.html`, etc.).
2. Ouvrez le fichier `sw.js` (Service Worker).
3. Incrémentez le numéro de version de la variable `CACHE_NAME` située à la toute première ligne.
   *Exemple : passez de `const CACHE_NAME = 'moonlight-v2.4';` à `const CACHE_NAME = 'moonlight-v2.5';`*
4. Poussez vos modifications sur le serveur (`git commit` et `git push`).

En faisant cela, le script intégré dans l'application détectera le nouveau `sw.js` et affichera une fenêtre popup à l'utilisateur : *"Nouvelle version de Moonlight disponible ! Recharger maintenant ?"*.

---

## 📝 Historique des Mises à Jour

### [v2.8] - 27 Août 2026
**Les rappels arrivaient sans aucun son, et le J-3 partait en pleine nuit :**
- **Cause principale : aucune notification n'avait de son.** Le plugin Capacitor ne pose `content.sound` que si le champ `sound` est fourni dans le payload. Moonlight ne le fournissait pas, donc iOS enregistrait chaque rappel avec `sound: (null)` et le livrait en silence. Vérifié dans le log système du simulateur : 59 notifications sur 59 étaient `sound: (null)` avant le correctif, 58 sur 58 portent un `UNNotificationSound` après.
- **Le J-3 tombait au milieu de la nuit.** Il était calculé en heures pleines depuis l'instant exact de la phase : la pleine lune du 28 août à 06:19 envoyait donc son « 3 jours avant » le 25 août à 06:19. Sur les 24 prochaines lunaisons, 8 J-3 et 8 J-1 tombaient entre 23 h et 8 h. Un rappel silencieux à 6 h du matin ne se voit jamais. Ils sont désormais fixés à 9 h (J-3) et 18 h (J-1), heure locale.
- **Le rappel « le jour J » avait le même défaut.** La règle « 8 h avant si la phase est le matin » ramenait le rappel à 2 h du matin pour une phase de 10 h. Une phase d'avant-midi s'annonce maintenant la veille à 21 h, avec l'heure exacte dans le message.
- **Toute la ligne de réglage est cliquable.** L'interrupteur ne mesurait que 44 × 24 px, sous la cible tactile minimale d'iOS.
- **Cache SW** : version PWA `v2.8` et paramètres `?v=2.8` sur les assets.

### [v2.4] - 30 Avril 2026
**Déploiements et Corrections :**
- **Correction du rendu des phases lunaires** : Le modèle mathématique qui dessinait la lune en SVG était défectueux. Correction du rayon de courbure du terminateur avec `Math.abs(Math.cos(phaseFraction * 2 * Math.PI)) * r` et correction de la direction de l'ombre (balayage SVG) sur la deuxième moitié du cycle lunaire.
- **Contournement des limites de notifications iOS** : Ajout d'alarmes natives (`VALARM`) directement intégrées dans le fichier calendrier exporté (`.ics`). L'agenda du téléphone se charge désormais d'envoyer les notifications fiables, remplaçant les Web Push souvent bloqués par iOS.
- **Cache SW** : Mise à jour de la version PWA vers `v2.4`.
