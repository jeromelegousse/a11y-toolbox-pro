# Comparatif avec des solutions professionnelles et pistes d'amélioration

Cette note sert de base pour situer A11y Toolbox Pro par rapport aux extensions d'accessibilité professionnelles et pour lister des évolutions prioritaires. Elle est amenée à vivre : mettez-la à jour à chaque itération majeure.

## Solutions observées

| Solution | Fonctionnalités marquantes | Positionnement |
| --- | --- | --- |
| **Deque axe DevTools** | Audit WCAG automatisé (DOM + contrastes), génération de rapports partageables, intégration CI/CD, tri par gravité | Outil expert pour développeurs et QA |
| **Microsoft Accessibility Insights** | Parcours guidés (FastPass), capture de scénarios, intégration GitHub/Azure Boards, suggestions de correctifs | Audit guidé multi-profils (dev, test, design) |
| **Stark** | Vérifications contraste/couleurs, simulation Daltonisme, export Figma/Sketch, collaboration équipe | Outil design + produit |
| **EqualWeb / accessiBe toolbars** | Barre flottante grand public, personnalisation UI (taille texte, espacement, curseurs, TTS), profils pré-configurés | Ciblent l'utilisateur final |

### Analyse détaillée par axe

| Axe | Forces des solutions pro | État actuel A11y Toolbox Pro | Pistes rapides |
| --- | --- | --- | --- |
| **UX / UI** | Parcours guidés, microcopie pédagogique, hiérarchie d'information claire (axe Insights, Stark) | Panneau unique avec options listées et vue Guides (checklists onboarding) mais peu de scénarios contextualisés | Prioriser les actions critiques, étendre l'onboarding contextuel et proposer des exemples d'usage |
| **Ergonomie** | Navigation clavier fluide, focus trap dans les dialogues, raccourcis cohérents, feedback état chargement | Focus trap complet, vue « Raccourcis » et centre d’état temps réel (TTS/STT/Braille) mais peu d’indicateurs pour les autres modules | Harmoniser les patterns clavier, ajouter indicateurs de statut (chargement/sauvegarde), préparer la personnalisation des raccourcis |
| **Fiabilité** | Tests automatisés (axe core), reporting d'erreurs, synchronisation cloud, compatibilité multi-navigateurs | Démo locale sans pipeline de tests, journal local uniquement | Ajouter tests unitaires + e2e, gestion offline/erreurs, fallback progressif sur features vocales |
| **Design** | Design systems documentés, tokens (couleurs, espace), mode sombre cohérent | Styles ad hoc par module, contraste variable, icônes hétérogènes | Définir tokens de base, bibliothèque d'icônes accessible, mode sombre clair | 

## Écarts actuels

- **Portée fonctionnelle** : la démo couvre surtout quelques actions temps réel (TTS, STT, contraste, espacement) mais n'exécute ni audit automatique ni export de rapports comme axe DevTools ou Accessibility Insights.
- **Personnalisation** : il manque des profils prêts à l'emploi (dyslexie, vision basse, etc.) et des options fines (voix TTS, raccourcis personnalisables) présentes chez Stark ou les toolbars commerciales.
- **Collaboration** : un journal exportable (JSON/CSV) est disponible mais il manque encore le partage multi-utilisateurs et les intégrations outils présentes dans les solutions professionnelles.
- **Gouvernance modules** : le registre est simple (`registerModule`, `registerBlock`) mais n'intègre pas de gestion de versions ou de dépendances, ce qui limite la scalabilité face aux bibliothèques modulaires plus matures.

## Manques par rapport à la feuille de route

- **Phase 0** :
  - Les tests automatisés restent à industrialiser (unitaires + visuels, point 6).
  - Le focus trap complet du panneau d’options est couvert (isolation inert + restitution focus) et le centre d’état unifie désormais voix, braille, contraste et espacements ; il reste à exposer les métriques de performance et de compatibilité.
  - L’atelier design system doit encore fournir les exports CSS/tokens prêts à l’emploi (point 7).
- **Phase 1** : aucun chantier sur le builder drag & drop, les collections de modules ou le chargement conditionnel n’a démarré.
- **Phase 2 et suivantes** : observabilité temps réel, profils dynamiques, catalogue de modules et multi-tenant restent entièrement à concevoir.

## Manques face à la concurrence

- **Audit automatisé** : absence d’analyse WCAG intégrée (axe DevTools, Accessibility Insights).
- **Guidage** : pas de parcours FastPass ou de checklists interactives.
- **Personnalisation avancée** : profils dynamiques, raccourcis personnalisables et réglages voix étendus manquent face à Stark.
- **Collaboration** : aucune intégration Jira/Linear/Slack ni partage multi-utilisateurs, contrairement aux suites professionnelles.
- **Observabilité** : pas de score de conformité ni d’analytics consolidés comme sur les plateformes enterprise, mais le centre d’état s’aligne progressivement sur les tableaux de bord temps réel proposés par Accessibility Insights ou Stark.

## Recommandations stratégiques

1. **Clarifier les cas d'usage**
   - Deux axes distincts :
     - *Assistant utilisateur final* (rapide, centré sur profils, sans audit).
     - *Outil développeur/QA* (audit, export, intégrations).
   - Décider si l'extension doit couvrir les deux via des « modes » ou se spécialiser.

2. **Renforcer la modularité**
   - Introduire une **déclaration de module** (manifest JSON ou objet) décrivant : id, version, dépendances, permissions, hooks UI.
   - Ajouter un `lifecycle` optionnel (`init`, `mount`, `unmount`, `onStateChange`) pour isoler la logique et autoriser le hot-reload en dev.
   - Prévoir un système de **garde-fous** : validation au `registerModule` (conflits d'id, champs obligatoires, compatibilité version framework).

3. **Faire évoluer l'offre d'options**
   - Profils sauvegardés (ex : Vision basse, Dyslexie) qui appliquent plusieurs modules via le store global (`state.tx`).
   - Options avancées : sélection voix TTS, vitesse par défaut, choix de dictionnaire braille, personnalisation raccourcis.
   - Paramétrage contextuel : permettre aux modules de déclarer leurs paramètres et d'afficher un panneau commun (comparable à Stark qui centralise la configuration contraste/vision).

4. **Améliorer l'expérience utilisateur et la cohérence visuelle**
  - Étendre les **parcours guidés** (vue Guides actuelle) vers des checklists contextuelles inspirées des FastPass d'Accessibility Insights pour accompagner la configuration avancée.
   - Ajouter une **microcopie d'aide** (tooltips, exemples) pour chaque option critique afin de réduire la charge cognitive.
   - Construire un **design system minimal** : palette accessible, échelles de spacing/typo, composants (boutons, input, toggles) mutualisés.
   - Définir un **mode sombre** et garantir une cohérence icône/illustration (SVG optimisés, lignes de 1.5px, labels visibles).

5. **Collaboration et observabilité**
   - Étendre `window.a11ytb.logActivity` pour exposer un journal exportable (JSON/CSV) et un système de tags (module, gravité).
   - Prévoir des connecteurs d'export (copie presse-papiers, webhook) pour se rapprocher des intégrations axe/Insights.

6. **Conformité et UX**
   - Ajouter une vérification de compatibilité navigateur (p. ex. fallback lorsqu'`speechSynthesis` est indisponible est déjà gérée mais pourrait être propagée sous forme d'état global `compat.features`).
   - Mettre en place un **score de conformité** (WCAG niveau AA vs AAA) récapitulant l'état des modules activés.
   - Documenter les **bonnes pratiques d'usage** (notamment limites des modules, contextes recommandés) pour aligner expérience et attentes utilisateurs.

## Vision produit modulaire (2025-2028)

Cette feuille de route s'articule autour d'une interface d'administration ergonomique : un panneau configurateur drag & drop
permettant de composer l'expérience utilisateur et de cocher/décocher dynamiquement les modules à charger.

### Phase 0 – Socle (T1-T2 2025)

1. ✅ Concevoir un format `module.json` facultatif pour documenter les métadonnées (implémenté via `src/module-manifest.js` et
   fusion automatique des `defaults`).
2. ✅ Ajouter des profils d'accessibilité préconfigurés au store initial (Vision basse, Dyslexie, Lecture vocale rapide).
3. ✅ Centraliser la gestion des options (panneau dédié Options & Profils avec champs déclarés dans les manifestes).
4. ✅ Étendre `window.a11ytb.logActivity` pour exposer un journal exportable (JSON/CSV) et des tags (module, gravité).
5. Documenter le guide module (voir `docs/module-guide.md`).
6. Mettre en place des tests automatisés (lint déjà dispo) et prévoir des tests visuels/screenshot pour les nouveaux blocs.
7. Lancer un **atelier de design system** : définir palette + composants de base, livrer un kit Figma pour préparer l'implémentation.
8. ✅ Ajouter un **focus trap** complet avec isolation (`inert`) du reste de la page pour le panneau d'options.

### Phase 1 – Admin modulaire (T3 2025)

- Développer un **builder drag & drop** pour ordonner les modules et blocs par simple glisser-déposer (support clavier inclus).
  - Composant "liste réordonnable" avec `aria-grabbed`, gestion focus et annonces live pour refléter la nouvelle position.
  - Interaction souris + tactile + clavier (touches `Space`/`Enter` pour saisir, `↑`/`↓` pour déplacer, `Esc` pour annuler).
  - Sauvegarde optimiste + rollback si un module échoue à se repositionner (ex : dépendance non satisfaite).
- Introduire des **collections de modules** : regroupements thématiques (lecture, navigation, contraste) avec bascule globale.
  - Définir un modèle `collection.json` (id, label, description, modules inclus, dépendances).
  - Afficher la collection comme un bloc repliable avec un switch maître qui active/désactive tous les modules compatibles.
  - Permettre les collections imbriquées (p. ex. "Lecture" > "Lecture immersive") avec héritage de priorités.
- Implémenter le **chargement conditionnel** : un panneau "Modules disponibles" affichant cases à cocher + état (actif, désactivé,
  requis par un profil) et appliquant le lazy-loading côté client.
  - Statut temps réel (badges "Actif", "Requis", "En conflit") + filtre par collection/profil.
  - Chargement via `import()` différé : précharger le manifest, charger le bundle uniquement à l'activation.
  - Gestion mémoire : déchargement (`unmount`) lors d'une désactivation manuelle avec sauvegarde de l'état utilisateur.
- Ajouter une vue "Dépendances" dans l'admin, affichant les modules requis avant activation.
- Versionner les manifestes (`semver`) et exposer un historique des changements dans l'interface.

### Phase 2 – Observabilité et personnalisation avancée (T4 2025 - T1 2026)

- Étendre l'admin avec un **journal temps réel** (filtres par module, export CSV) et notifications en cas d'erreur de chargement.
- Proposer des **profils dynamiques** configurables par glisser-déposer : l'administrateur compose un profil, définit les options
  par défaut et choisit quels modules sont cochés au démarrage.
- Ajouter une **librairie de presets UI** (mises en page du panneau utilisateur) pouvant être activées/désactivées comme les modules.
- Mettre en place des **tests de régression UX** automatisés (axe clavier, focus trap) intégrés à la CI.

### Phase 3 – Ouverture écosystème (T2-T4 2026)

- Ouvrir un **catalogue de modules** : listing filtrable, badges d'accessibilité, vérification de compatibilité automatique.
- Autoriser l'installation de modules distants via URL signée, avec écran de revue (permissions, hooks, taille bundle).
- Ajouter une **sandbox de test** dans l'admin pour prévisualiser un module avant activation globale.
- Fournir une API d'extension pour configurer des **panneaux personnalisés** (UI slots) dans l'admin drag & drop.

### Phase 4 – Gouvernance et multi-tenant (2027)

- Introduire la notion d'**espaces d'organisation** : plusieurs équipes peuvent gérer leurs listes de modules/profils.
- Intégrer un **workflow de validation** (brouillon → revue → publication) avec historique des versions.
- Connecter des **services externes** (Jira, Linear, Slack) pour pousser les audits/access logs depuis l'admin.
- Mettre à disposition un **SDK de packaging** facilitant la création/validation de modules tiers.

### Phase 5 – Plateforme complète (2028)

- Déployer un **marketplace certifié** et un système de notation communautaire.
- Ajouter des **tableaux de bord analytics** (usage des modules, performance, conformité WCAG) avec segmentation par profil.
- Publier un **design system public** synchronisé avec le builder drag & drop, incluant composants React/Web Components.
- Offrir un **mode audit automatisé** orchestrant l'exécution sélective de modules (axe-core, contrastes, navigation) et
  consolidant les rapports dans l'admin.

## Étapes court terme

1. Consolider la documentation module (exemples drag & drop, bonnes pratiques de lazy-loading) et la faire valider par les
   premiers contributeurs externes.
2. Déployer la première version de l'**interface drag & drop** (Phase 1) en se concentrant sur l'accessibilité clavier et les
   préférences sauvegardées.
3. Mettre en place des **tests contractuels** sur le manifest (validation JSON Schema, dépendances cycliques).
4. Introduire un **switch de chargement différé** par module (coché/décoché) côté runtime pour mesurer l'impact performance.
5. Instrumenter le **centre d’état** (latence de chargement, compatibilité navigateur) pour se rapprocher des indicateurs temps réel d’Accessibility Insights et Stark.
6. Documenter un **processus de contribution** pour les modules (template PR, checklist accessibilité, revue design system).

## Étapes moyen terme

- Scanner d'accessibilité (intégration axe-core ou Pa11y) pour produire des rapports directement dans l'admin.
- API plugin distants : charger des modules depuis un CDN signé avec mise en quarantaine si la vérification échoue.
- Gestion multilingue (i18n) afin de couvrir les marchés ciblés et localiser l'interface drag & drop.
- Parcours guidé d'audit rapide (FastPass-like) avec checklist, indicateurs de progression et export résumé.
- Synchronisation des préférences utilisateurs via stockage cloud sécurisé pour fiabiliser l'expérience multi-supports.
- Lancement d'un **programme bêta** pour les modules tiers, incluant audit de sécurité et validation RGPD.

## Étapes long terme

- Intégration CI/CD (npm package + documentation d'intégration) avec scénarios de tests modulaires automatisés.
- Tableau de bord analytics (statistiques d'usage des modules) dans le respect RGPD, interfaçable avec des outils BI.
- Publication d'un **design system public** (documentation + composants web) pour favoriser l'écosystème de modules tiers.
- Mise en place d'un **système de licences** et de partenariats pour les modules premium.

Mise à jour : 2025-10-16
