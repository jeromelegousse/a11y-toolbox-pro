# Stratégie de tests A11y Toolbox Pro

Ce document précise comment nous automatisons les vérifications et comment ajouter de nouveaux scénarios (lint, tests visuels, CI).

## 1. Scripts disponibles

| Commande | Description |
| --- | --- |
| `npm run lint` | Exécute ESLint (`src/**/*.js`) puis Stylelint (`src/**/*.css`). Le script échoue sur le moindre avertissement. |
| `npm run test:unit` | Exécute les tests Vitest (store, manifest, logique métier). |
| `npm run test:visual` | Lance Playwright (Chromium) et vérifie les snapshots du panneau Options & Profils. Définissez `PLAYWRIGHT_SKIP_VISUAL_TESTS=1` si les dépendances système des navigateurs ne sont pas disponibles (CI légère, conteneur minimal, etc.) afin d’ignorer l’intégralité de la suite visuelle. |
| `npm run test` | Chaîne `npm run lint`, `npm run test:unit` puis `npm run test:visual`. Utilisée par la CI. |

## 2. Tests unitaires (Vitest)

- Les scénarios unitaires résident dans `tests/*.test.js` et `tests/**/*.test.js` (hors `visual/`).
- `tests/inert.test.js` couvre l’isolation `inert` appliquée au panneau pour sécuriser le focus trap.
- `tests/status-center.test.js` vérifie les synthèses d’état temps réel (TTS, STT, Braille) exposées dans le panneau.
- `tests/guided-checklists.test.js` valide le calcul d’avancement des checklists Guides et la persistance des étapes manuelles.
- Utilisez `vitest` en mode watch (`npx vitest`) pendant le développement pour profiter du rechargement à chaud.
- Mockez les APIs navigateur via des helpers simples (ex. `MemoryStorage` dans `tests/store.test.js`) afin de conserver des tests déterministes.
- Ajoutez un test dédié pour chaque régression corrigée au niveau des modules ou du store.

## 3. Tests visuels (Playwright)

- Les tests résident dans `tests/visual/`.
- Après `npm install`, exécutez `npx playwright install` pour récupérer les navigateurs locaux (non requis en CI GitHub Actions).
- Les captures de référence sont stockées sous forme Base64 texte dans `tests/visual/baselines/` (une ligne = 76 caractères).
- Pour mettre à jour une capture de référence après un changement visuel :
  1. Vérifiez manuellement que le rendu est conforme.
  2. Exécutez `UPDATE_VISUAL_BASELINE=1 npm run test:visual` (le test régénère le fichier Base64).
  3. Commitez le fichier `.base64` mis à jour et mentionnez le changement dans la PR.
- Les zones sujettes à variation (journal d’activité) sont masquées via l’option `mask` de `locator.screenshot` dans le test.
- Ajoutez un nouveau fichier `*.spec.js` pour chaque bloc nécessitant une capture dédiée. Inspirez-vous de `options-panel.spec.js` pour :
  - monter la UI via le serveur statique (`http-server`),
  - simuler la navigation clavier,
  - documenter les attentes en commentaire.

## 4. Règles pour les nouveaux blocs/modules

1. Ajouter un test Playwright minimal qui :
   - charge `index.html`,
   - ouvre le bloc ou module ciblé,
   - vérifie au moins un parcours clavier,
   - capture une vue stable.
2. Masquer les éléments dynamiques (`mask`) ou stabiliser l’état via le store pour éviter les faux positifs.
3. Documenter le scénario dans la PR (section « Tests ») et compléter cette page si un nouveau pattern est requis.

## 5. Intégration continue

- Le workflow `CI` (GitHub Actions) installe les dépendances, exécute `npm run test` et publie le rapport Playwright en artefact.
- Tout échec (lint ou visual) bloque la PR.
- Les rapports Playwright HTML sont générés dans `tests/visual/report/` et ignorés par Git (`.gitignore`).

## 6. Résolution des échecs fréquents

- **Snap différent** : inspectez `test-results/.../error-context.md` et relancez `UPDATE_VISUAL_BASELINE=1 npm run test:visual` si le changement est souhaité.
- **Focus non trouvé** : vérifiez les attributs ARIA/focusable du composant et synchronisez-vous avec le focus trap (voir `src/ui.js`).
- **Serveur indisponible** : assurez-vous qu’aucun autre processus n’utilise le port `4173` ou changez-le dans `playwright.config.js`.

Maintenez cette page à jour à chaque nouveau type de test ou outil automatisé.
