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

> Les versions déclarées dans `manifest.version` et `dependencies[].version` doivent respecter la spécification semver (`1.2.3`). Les tentatives de rétrogradation sont bloquées lors de l’enregistrement pour garantir une progression continue des manifestes.

> Astuce : `config.fields` accepte aujourd’hui les types `range`, `toggle` et `select`. Chaque champ doit définir `path` (clé du
> store) et `label`. Les fonctions `format`, `onChange` et `getOptions` sont supportées pour personnaliser le rendu.

## Flux de validation

1. Chaque module importe `registerModule` et lui passe `manifest` avec `id` identique.
2. `validateModuleManifest` nettoie les valeurs (trim, toLowerCase sur les mots-clés, suppression des entrées vides).
3. Le manifest est gelé (`Object.freeze`) et exposé via `listModuleManifests()` / `getModuleManifest()`.
4. `mergeManifestDefaults` fusionne les `defaults.state` dans l’état initial (`src/main.js`), ce qui dispense d’éditer `main.js`
   lors de l’ajout d’un module.
5. `registerModuleManifest` applique un garde-fou semver : un manifest à version identique remplace l’existant uniquement si le contenu diffère, tandis qu’une version inférieure est historisée puis ignorée.

## API associées

- `listModuleManifests()` : retourne la liste des manifestes normalisés (utile pour générer une palette d’options ou un export).
- `getModuleManifest(id)` : récupère un manifest précis.
- `mergeManifestDefaults(state, manifest)` : utilitaire pour injecter des valeurs d’état si absentes.
- `getModuleManifestHistory(id)` : renvoie l’historique des versions enregistrées (upgrade, refresh, downgrade rejetée).
- `listModuleManifestHistory()` : synthèse de tous les historiques disponibles pour préparer un futur tableau de bord.
- `window.a11ytb.registry` expose ces méthodes pour un accès runtime (ex. depuis un module externe ou une console de debug).

Ces conventions préparent l’introduction d’un fichier `module.json` par module tout en sécurisant l’intégration multi-équipe.

## Audit automatisé des manifestes

- `npm run lint:manifests` exécute `scripts/validate-manifests.mjs`.
- Le script réutilise `validateModuleManifest`, vérifie l’unicité des identifiants et exige un niveau **AA** de couverture métadonnées (seuils inspirés de Deque axe DevTools, Accessibility Insights et Stark).
- Les avertissements listent les recommandations manquantes (`metadataQuality.recommendations`) pour cibler rapidement les champs à compléter.

L’audit s’exécute automatiquement via `npm run lint` et doit rester vert avant toute Pull Request.

## Guides FastPass et checklists

Les manifestes exposent des parcours FastPass via `manifest.guides`. Chaque entrée décrit une checklist séquencée qui alimente la vue **Guides** et rapproche l’expérience des parcours proposés par Accessibility Insights.

### Structure générale

```jsonc
{
  "id": "audit-fastpass",                // identifiant unique du parcours
  "title": "Audit axe-core express",     // titre lisible affiché dans l’UI
  "description": "Préparer et partager un audit.",
  "category": "diagnostic",              // regroupement logique (vision, audio…)
  "order": 20,                            // position relative dans la vue Guides
  "prerequisites": [                      // optionnel : modules ou vérifications nécessaires
    { "type": "module", "id": "audit" },
    { "type": "module", "id": "tts", "optional": true }
  ],
  "steps": [                              // séquence ordonnée d’étapes
    {
      "id": "audit-module-ready",
      "label": "Vérifier la disponibilité du module Audit",
      "mode": "auto",                    // "auto" = vérification runtime, "manual" = action utilisateur
      "detail": "Audit prêt à lancer.",
      "announce": "Module Audit opérationnel.",
      "check": "({ runtime }) => runtime?.state === 'ready'" // fonction évaluée côté UI
    },
    {
      "id": "audit-share",
      "label": "Partager le rapport",
      "mode": "manual",
      "detail": "Export CSV/JSON et diffusion de la synthèse.",
      "toggleLabels": {
        "complete": "Marquer comme fait",
        "reset": "Marquer à refaire"
      }
    }
  ],
  "assistance": {
    "microcopy": "Planifiez un audit après chaque livraison majeure.",
    "examples": [
      { "id": "share-tip", "title": "Astuce", "description": "Diffuser le CSV aux squads produit." }
    ],
    "resources": [
      {
        "id": "axe-docs",
        "href": "https://dequeuniversity.com/axe/devtools",
        "label": "Documentation axe DevTools",
        "external": true
      }
    ]
  },
  "tags": ["fastpass", "onboarding"]
}
```

### Détails des champs

| Champ | Type | Description |
| --- | --- | --- |
| `id` | `string` (obligatoire) | Identifiant unique du guide. Sert de clé pour l’état utilisateur. |
| `title`, `description`, `category`, `order` | `string`, `number` | Métadonnées d’affichage. `order` peut être laissé vide (`100` par défaut). |
| `prerequisites` | `Array<string \| object>` | Liste des prérequis. Une chaîne est interprétée comme `moduleId`. Un objet accepte `type` (`module`, `feature`, `custom`…), `id`, `optional`, `label`, `detail`, `check`. |
| `steps` | `object[]` | Étapes ordonnées. Chaque étape doit définir `id`, `label` et `mode`. |
| `steps[].mode` | `"auto" \| "manual"` | `auto` déclenche `check(context)` pour déterminer l’état ; `manual` utilise l’état stocké (`ui.guides.completedSteps`). |
| `steps[].check` | `function(context)` | Fonction optionnelle évaluée côté client. Le `context` fournit `snapshot`, `runtime.modules`, `manifest`, `helpers`. |
| `steps[].detail` / `steps[].announce` | `string \| function(context)` | Texte d’accompagnement. `announce` est diffusé dans une région `aria-live` pour guider l’utilisateur. |
| `steps[].toggleLabels` | `{ complete, reset }` | Personnalisation des libellés « Marquer comme fait/à refaire » pour les étapes manuelles. |
| `steps[].hints` | `string[]` | Micro-indications supplémentaires affichées sous l’étape. |
| `assistance.microcopy` | `string \| function(context)` | Message pédagogique injecté avant la liste d’étapes. |
| `assistance.examples` | `Array<{ id, title?, description? }>` | Cartes d’exemples ou bonnes pratiques. |
| `assistance.resources` | `Array<{ id, href, label, external? }>` | Liens utiles (documentation FastPass, guides internes). |
| `tags` | `string[]` | Facilite le filtrage/score de qualité. |

> Les guides peuvent être définis directement dans le manifest ou référencer un flux prédéfini (`fastPassFlows`) pour harmoniser les parcours standards (audit, dictée, contraste…).

## Historique et visualisation

Le centre d’état consomme `listModuleManifestHistory()` pour alimenter la carte **Historique manifestes**. Cette carte annonce :

- le nombre de manifestes suivis vs. déclarés ;
- les mises à jour effectuées sur les 30 derniers jours ;
- les rétrogradations bloquées par le garde-fou semver ;
- les manifestes encore dépourvus d’historique.

L’objectif est de fournir un équivalent aux chronologies proposées par Accessibility Insights ou axe DevTools tout en restant léger : la carte se lit au clavier, annonce les ratios clés via `aria-live` et sert de point de repère pour prioriser les manifestes à remettre à niveau avant d’implémenter un diff détaillé.

## Indice de qualité des métadonnées

Depuis l’itération courante, `validateModuleManifest` calcule automatiquement un objet `metadataQuality`. Cet indice vérifie onze
critères inspirés des consoles professionnelles (axe DevTools, Accessibility Insights, Stark) : description détaillée, catégories
et mots-clés filtrables, options exposées dans le panneau global, prérequis de compatibilité, guides FastPass et éléments de
gouvernance. Chaque critère est pondéré pour refléter les attentes concurrentes (guidage et compatibilité pèsent davantage).

```jsonc
{
  "level": "AA",           // AAA > AA > A > B > C
  "levelLabel": "Avancé",  // libellé lisible pour l’interface
  "coverage": 0.74,         // ratio de critères satisfaits
  "coveragePercent": 74,
  "summary": "Couverture métadonnées : 74 % (niveau AA).",
  "detail": "À compléter : Guides FastPass et Licence déclarée.",
  "missing": ["Guides FastPass", "Licence déclarée"],
  "recommendations": [
    "Déclarez des guides pour rivaliser avec les parcours FastPass d’Accessibility Insights.",
    "Ajoutez la licence du module pour sécuriser la gouvernance."
  ],
  "checks": [
    { "id": "guides", "passed": false, "dimension": "guidage", "weight": 1.5 },
    { "id": "compat", "passed": true,  "dimension": "fiabilité", "weight": 1.25 }
  ]
}
```

L’interface **Modules disponibles** met en avant ce score via un badge et des recommandations ciblées, ce qui rapproche le
catalogue maison des grilles de maturité proposées par Stark ou EqualWeb. Le centre d’administration agrège également ces
indicateurs dans une carte « Maturité manifestes » pour comparer la couverture moyenne face aux workflows FastPass et Stark.

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
