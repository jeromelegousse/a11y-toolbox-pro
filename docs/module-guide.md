# Guide de création de modules A11y Toolbox Pro

Ce guide explique comment ajouter un module ou un bloc sans casser l'existant. Il s'appuie sur l'architecture actuelle (`src/registry.js`, `src/store.js`) et prépare l'arrivée d'un système de manifestes versionnés.

## 1. Principes généraux

1. **Isolation** : un module ne doit modifier que ses propres clés d'état (`state.set('moduleId.*')`) et DOM. Pas d'effets globaux non documentés.
2. **Pureté UI** : utilisez le système de blocs (`registerBlock`) pour le rendu afin d'avoir un markup homogène (`renderBlock`).
3. **Accessibilité native** : chaque contrôle doit disposer d'un libellé (`aria-label`, `aria-describedby`) et suivre les patrons WAI-ARIA.
4. **Observabilité** : journalisez les actions côté utilisateur via `window.a11ytb.logActivity` lorsque pertinent (`window.a11ytb.logActivity('Lecture terminée', { module: manifest.id, tone: 'confirm', tags: ['tts'], severity: 'success' })`). Les entrées sont exportables en JSON/CSV via `window.a11ytb.activity`.

## 2. Anatomy d'un module

Chaque module se décrit désormais via un **manifest** validé par `src/module-manifest.js`. Exportez-le pour qu’il puisse être
réutilisé :

```js
export const manifest = {
  id: 'exemple',
  name: 'Nom affiché',
  version: '0.1.0',
  description: 'Résumé court',
  category: 'vision',
  keywords: ['mot-clé'],
  permissions: ['speechSynthesis'],
  defaults: {
    state: {
      exemple: { enabled: false }
    }
  }
};
```

`registerModule` normalise et enregistre ce manifest (dépendances, permissions, compatibilité…). Les champs inconnus sont
ignorés avec un avertissement. Le manifest permet aussi d’injecter les valeurs par défaut du store via `defaults.state` :
elles sont fusionnées automatiquement dans `src/main.js` grâce à `mergeManifestDefaults`.

Depuis l’introduction du panneau « Options & Profils », un manifest peut également déclarer un tableau `config.fields`.
Chaque champ (type `range`, `toggle`, `select`…) est rendu automatiquement dans le panneau et relié au store (`state.set`).
Voir `src/modules/tts.js` pour un exemple complet.

Un module est un objet enregistré via `registerModule`. Il doit au minimum fournir :

```js
registerModule({
  id: manifest.id,
  manifest,
  init({ state, registry, ui }) {
    // Votre code d'initialisation
  }
});
```

- `id` : identifiant unique (slug). Préfixez si module expérimental (`exp-ttsplus`).
- `init(context)` : appelé une seule fois au chargement. Utilisez-le pour exposer des API sur `window.a11ytb` ou pour inscrire des blocs.
- `manifest` : obligatoire à terme. Pour l’instant, le système injecte un manifest minimal si le module ne fournit rien, mais
  tout nouveau module doit l’exporter et le passer à `registerModule`.

### 2.1. Gestion de l'état

Le store observable se crée via `createStore` (`src/store.js`). Il expose `get`, `set`, `tx`, `on`, `reset` et `serialize`.

- Stockez les valeurs du module sous `state.set('exemple.option', valeur)` afin d'éviter les collisions.
- Pour des mises à jour multiples, préférez `state.tx({ exemple: { ... } })`.
- Abonnez-vous aux changements si besoin : `const unsubscribe = state.on(nextState => { ... });` N'oubliez pas d'appeler `unsubscribe` lors du nettoyage futur (quand `unmount` sera disponible).

### 2.2. Interaction UI

- Enregistrez un bloc via `registerBlock({ id, title, icon, render, wire })`.
  - `render(state)` doit retourner une string HTML. Les templates littéraux commentés (`/* html */` au-dessus de la string) améliorent la lisibilité.
  - `wire({ root, state })` attache les gestionnaires (`addEventListener`) et synchronise l'état.
- Utilisez les classes utilitaires existantes (`a11ytb-module`, `a11ytb-module-content`, etc.) pour conserver le style.
- Pour exposer des contrôles globaux, décrivez-les dans `manifest.config.fields` (le panneau Options & Profils les rend et synchronise le store automatiquement).
- Référez-vous au kit Design System (`docs/design-system-workshop.md`) pour la palette et les composants de base (boutons, chips, champs) avant d'introduire de nouvelles variantes.

### 2.3. APIs globales

Les modules existants exposent leurs actions sur `window.a11ytb` (ex : `window.a11ytb.tts.speakPage()`).

- Espace de nommage : `window.a11ytb[mod.id] = { ... }`.
- Documentez chaque méthode dans le module (commentaire JSDoc) et dans `docs/modules/<id>.md` lorsqu'il existera.
- Vérifiez la présence de l'API native avant usage (ex : `speechSynthesis` dans `src/modules/tts.js`).

## 3. Workflow de développement

1. **Créer une branche** dédiée.
2. **Initialiser les fichiers** :
   - `src/modules/<id>.js`
   - `docs/modules/<id>.md` (nouvelle doc) décrivant comportement, paramètres, limitations.
3. **Déclarer les métadonnées** (en attendant les manifestes formalisés) dans le module :

```js
const metadata = {
  id: 'exemple',
  version: '0.1.0',
  category: 'vision',
  keywords: ['vision', 'zoom'],
  permissions: ['speechSynthesis'],
  compat: {
    browsers: ['chrome >= 100', 'firefox >= 115']
  }
};
```

Exposez-les temporairement via `window.a11ytb.registry?.define(metadata)` ou ajoutez-les à `registerBlock` (propriété `keywords`).

4. **Tests & automatisation** :
   - `npm run lint` exécute ESLint et Stylelint (obligatoire avant commit, lancé en CI).
  - `npm run test:visual` vérifie les captures Playwright. Utilisez `UPDATE_VISUAL_BASELINE=1 npm run test:visual` quand un changement visuel est volontaire et documentez-le.
   - Vérifications clavier uniquement (navigation Tab/Shift+Tab) et narration (NVDA/VoiceOver) restent indispensables.
   - Les stratégies détaillées sont décrites dans `docs/testing-strategy.md`.

5. **PR checklist** :
   - Captures d'écran avant/après si UI + vérifier les snapshots Playwright.
   - Mise à jour des docs et du changelog (à ajouter).
   - Mention explicite des nouvelles clés d'état.

## 4. Préparer le futur système modulaire

En attendant l'implémentation du manifest, adoptez ces conventions :

- Ajoutez `export const moduleId = 'exemple';` pour réutiliser l'identifiant.
- Définissez `const DEFAULT_STATE = { ... };` et assurez-vous que `createStore` l'inclut lors de l'initialisation (`state.tx({ exemple: DEFAULT_STATE })`).
- Séparez la logique pure dans `src/modules/<id>/service.js` si elle grossit.
- Nommez les événements personnalisés sous la forme `a11ytb:<module>:event`.

## 5. Maintenance et compatibilité

- Surveillez les breaking changes : documentez dans `docs/changelog.md` (à créer).
- Utilisez le versionnage sémantique pour les modules (`0.x` tant que l'API n'est pas stabilisée).
- Lorsqu'un module nécessite une API externe, enveloppez-la dans un adaptateur (`services/<api>.js`) pour faciliter le mocking.

## 6. Ressources complémentaires

- `src/registry.js` : enregistrement et rendu des blocs (`renderBlock`).
- `src/store.js` : API d'état observable + persistance localStorage.
- `src/modules/tts.js`, `src/modules/contrast.js` : exemples d'intégration de l'API globale (`window.a11ytb`).

## 7. Réflexion sur l'auto-détection des modules

Pour accélérer l'onboarding de nouveaux modules, nous visons une détection automatique des fichiers présents dans `src/modules/`. Les principes suivants guident cette évolution :

- **Convention de nommage** : chaque module expose un `manifest` (voir §2) et exporte une fonction `registerModule`. Un script de démarrage pourrait scanner le répertoire, importer dynamiquement les modules et valider leurs manifestes via `validateModuleManifest`. Cela limite les oublis d'import manuel dans `src/main.js`.
- **Activation déclarative** : l'état persistant (`ui.disabled`) garde la liste des modules désactivés. Une interface d’administration (voir le nouveau panneau « Administration des modules ») affiche automatiquement les entrées détectées et permet de les activer/désactiver par simple case à cocher. Côté runtime, `applyModuleLayout` masque les modules désactivés tout en laissant possible leur affichage lorsque « Afficher les modules masqués » est actif.
- **Gestion des métadonnées** : le panneau d’administration affiche les icônes fournies par le bloc (avec un fallback automatique). Il serait possible d’étendre cette logique pour afficher la version du module ou ses dépendances. Une étape complémentaire consisterait à accepter un fichier `module.json` à côté du module JS pour importer les métadonnées sans exécuter la logique principale.
- **Prévisualisation et drag-and-drop** : la hiérarchisation des modules est désormais persistée (`ui.moduleOrder`) et modifiable par glisser-déposer. Coupler cette fonctionnalité à l’auto-détection garantira que tout nouveau module apparaît immédiatement dans l’UI, où un administrateur pourra décider de son ordre et de son statut.

Cette réflexion suppose de compléter le pipeline par un « loader » (script de build ou initialisation) qui importe automatiquement les modules détectés et signale les erreurs de manifest. À moyen terme, on pourra aussi envisager un dossier `modules-disabled/` pour stocker des modules non embarqués dans le bundle tout en conservant leurs manifestes.

Gardez ce guide à jour à chaque nouveau module ou modification de framework.
