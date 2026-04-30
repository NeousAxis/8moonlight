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

### [v2.4] - 30 Avril 2026
**Déploiements et Corrections :**
- **Correction du rendu des phases lunaires** : Le modèle mathématique qui dessinait la lune en SVG était défectueux. Correction du rayon de courbure du terminateur avec `Math.abs(Math.cos(phaseFraction * 2 * Math.PI)) * r` et correction de la direction de l'ombre (balayage SVG) sur la deuxième moitié du cycle lunaire.
- **Contournement des limites de notifications iOS** : Ajout d'alarmes natives (`VALARM`) directement intégrées dans le fichier calendrier exporté (`.ics`). L'agenda du téléphone se charge désormais d'envoyer les notifications fiables, remplaçant les Web Push souvent bloqués par iOS.
- **Cache SW** : Mise à jour de la version PWA vers `v2.4`.
