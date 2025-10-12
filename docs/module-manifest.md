# Manifestes de modules

Les manifestes décrivent les métadonnées d’un module et sont validés par `src/module-manifest.js`. Chaque module exporte un
objet `manifest` passé à `registerModule`. Les objectifs :

- documenter les permissions/dépendances nécessaires ;
- fournir un point d’entrée pour générer un futur `module.json` ;
- injecter automatiquement les valeurs par défaut du store (`defaults.state`).

## Champs supportés

| Champ | Type | Description |
| --- | --- | --- |
| `id` | `string` (obligatoire) | Identifiant unique du module. Doit correspondre à `definition.id`. |
| `name` | `string` | Nom lisible utilisé dans l’interface ou la documentation. |
| `version` | `string` | Version semver. Si absent, `0.0.0` est utilisée. |
| `description` | `string` | Résumé court pour la documentation. |
| `category` | `string` | Regroupement logique (vision, interaction, conversion…). |
| `keywords` | `string[]` | Mots-clés pour la recherche/filtrage. |
| `permissions` | `string[]` | Permissions ou APIs requises (`speechSynthesis`, `speechRecognition`, etc.). |
| `dependencies` | `Array<string | { id, version? }>` | Dépendances vers d’autres modules. |
| `homepage`, `bugs`, `license` | `string` | Métadonnées standard inspirées des packages npm. |
| `authors` | `Array<string | { name, email?, url? }>` | Liste des personnes responsables. |
| `defaults.state` | `object` | Valeurs initiales fusionnées dans le store (non destructives). |
| `lifecycle` | `object` | Hooks optionnels (`init`, `mount`, `unmount`, `onStateChange`) prêts pour une future exploitation. |
| `config` | `object` | Schéma libre pour décrire les options exposées au panneau global. |
| `compat` | `object` | Contrainte de compatibilité (`browsers`, `features`). Les valeurs sont agrégées dans `runtime.modules.<id>.metrics.compat` pour calculer un score global (AA/AAA). |

Les champs inconnus sont ignorés avec un avertissement console pour éviter les fautes de frappe.

> Astuce : `config.fields` accepte aujourd’hui les types `range`, `toggle` et `select`. Chaque champ doit définir `path` (clé du
> store) et `label`. Les fonctions `format`, `onChange` et `getOptions` sont supportées pour personnaliser le rendu.

## Flux de validation

1. Chaque module importe `registerModule` et lui passe `manifest` avec `id` identique.
2. `validateModuleManifest` nettoie les valeurs (trim, toLowerCase sur les mots-clés, suppression des entrées vides).
3. Le manifest est gelé (`Object.freeze`) et exposé via `listModuleManifests()` / `getModuleManifest()`.
4. `mergeManifestDefaults` fusionne les `defaults.state` dans l’état initial (`src/main.js`), ce qui dispense d’éditer `main.js`
   lors de l’ajout d’un module.

## API associées

- `listModuleManifests()` : retourne la liste des manifestes normalisés (utile pour générer une palette d’options ou un export).
- `getModuleManifest(id)` : récupère un manifest précis.
- `mergeManifestDefaults(state, manifest)` : utilitaire pour injecter des valeurs d’état si absentes.
- `window.a11ytb.registry` expose ces méthodes pour un accès runtime (ex. depuis un module externe ou une console de debug).

Ces conventions préparent l’introduction d’un fichier `module.json` par module tout en sécurisant l’intégration multi-équipe.

## Métriques runtime dérivées

Lors du chargement, `module-runtime.js` renseigne `runtime.modules.<id>.metrics` afin de suivre l’état opérationnel de chaque module.

### Indicateurs suivis

- `attempts`, `successes`, `failures`, `retryCount` : compteurs de tentatives, succès, échecs et réessais.
- `lastError`, `lastAttemptAt` : dernier message d’erreur et horodatage de la tentative.
- `timings.load` / `timings.init` : dernières durées mesurées (ms), moyenne et nombre d’échantillons.
- `timings.combinedAverage` : latence moyenne cumulée (chargement + initialisation).
- `compat.required` : prérequis déclarés dans le manifest (`browsers`, `features`).
- `compat.missing` : prérequis non satisfaits détectés côté client.
- `compat.unknown` : prérequis à vérifier manuellement (non détectables automatiquement).
- `compat.score` : score synthétique (AAA si tout est conforme, AA si des manques sont détectés).
- `compat.status` et `compat.checkedAt` : statut d’évaluation et horodatage du dernier contrôle.

Les fonctionnalités reconnues par défaut pour `compat.features` sont `SpeechRecognition`, `SpeechSynthesis` et `AudioContext`. Toute autre valeur est marquée comme « à vérifier » afin d’éviter les faux positifs.
