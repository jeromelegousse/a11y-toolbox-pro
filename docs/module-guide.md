# Guide de création de modules A11y Toolbox Pro

Ce guide explique comment ajouter un module ou un bloc sans casser l'existant. Il s'appuie sur l'architecture actuelle (`src/registry.js`, `src/store.js`) et prépare l'arrivée d'un système de manifestes versionnés.

## 1. Principes généraux

1. **Isolation** : un module ne doit modifier que ses propres clés d'état (`state.set('moduleId.*')`) et DOM. Pas d'effets globaux non documentés.
2. **Pureté UI** : utilisez le système de blocs (`registerBlock`) pour le rendu afin d'avoir un markup homogène (`renderBlock`).
3. **Accessibilité native** : chaque contrôle doit disposer d'un libellé (`aria-label`, `aria-describedby`) et suivre les patrons WAI-ARIA.
4. **Observabilité** : journalisez les actions côté utilisateur via `window.a11ytb.logActivity` lorsque pertinent.

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
- Pour les contrôles partagés (options globales), exposez une fonction `exportConfig()` qui renverra la configuration et pourra être agrégée par le futur panneau d'options.

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

4. **Tests manuels** :
   - `npm run lint`
   - Vérifications clavier uniquement (navigation Tab/Shift+Tab).
   - Tests narrateur (NVDA/VoiceOver) si possible.

5. **PR checklist** :
   - Captures d'écran avant/après si UI.
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

Gardez ce guide à jour à chaque nouveau module ou modification de framework.
