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
| **Fiabilité** | Tests automatisés (axe core), reporting d'erreurs, synchronisation cloud, compatibilité multi-navigateurs | Suite de tests (lint, unitaires Vitest, visuels Playwright) et journal exportable mais pas encore de CI distante ni de monitoring cloud | Connecter la CI, ajouter des tests offline/résilience et prévoir un reporting partagé |
| **Design** | Design systems documentés, tokens (couleurs, espace), mode sombre cohérent | Styles ad hoc par module, contraste variable, icônes hétérogènes | Définir tokens de base, bibliothèque d'icônes accessible, mode sombre clair | 

## Écarts actuels

- **Portée fonctionnelle** : la démo embarque maintenant un module d’audit axe-core complet (lancement manuel, synthèse, exports JSON/CSV) et un centre d’état corrélé, ce qui rapproche l’outil d’axe DevTools/Accessibility Insights. La planification récurrente (toutes les heures/quotidienne/hebdomadaire avec plage horaire) est accessible depuis Options & Profils avec journalisation automatique des exécutions, et les parcours FastPass (Audit, Synthèse vocale, Dictée, Contraste, Braille, Espacements) sont disponibles dans la vue Guides. Reste à corréler ces parcours avec des scénarios utilisateurs pour compléter la boucle d’observation.
- **Personnalisation** : les profils préconfigurés peuvent être combinés avec des réglages fins (voix TTS, vitesse, volume, paramètres audio, dictionnaire braille) directement issus des manifestes. La duplication, le partage/import de profils et le premier lot de raccourcis configurables sont disponibles ; il reste à enrichir l’édition collaborative et la gestion avancée des raccourcis pour atteindre la profondeur de Stark.
- **Administration modulaire** : le builder réordonnable intègre désormais des collections activables en un clic, la désactivation conditionnelle et le lazy-loading des modules au runtime. Il reste à gérer les collections imbriquées, les vues d’ensemble par profil et le chargement différé côté réseau (préchargement progressif, stratégie cache).
- **Collaboration** : le journal exportable (JSON/CSV) et les métriques runtime apportent une base de partage, mais il n’y a toujours pas d’espace multi-utilisateurs, de commentaires ni de synchronisation cloud comme dans les suites professionnelles.
- **Gouvernance modules & observabilité** : les manifestes versionnés exposent désormais dépendances, compatibilité, métriques de performance (load/init, compat features) **et un indice `metadataQuality` pondéré** aligné sur les consoles Stark/Accessibility Insights. Un garde-fou semver avec historique bloque les rétrogradations, un tableau de bord de maturité consolide la couverture face aux offres pro **et une carte « Historique manifestes » rend visibles les derniers upgrades/refus pour rivaliser avec Accessibility Insights** ; il manque encore la revue des dépendances transverses et un reporting multi-modules partagé.

## Manques par rapport à la feuille de route

- **Phase 0** :
  - ✅ Concevoir un format `module.json`/manifest pour documenter les métadonnées (validation, fusion `defaults`).
  - ✅ Ajouter des profils d’accessibilité préconfigurés (Vision basse, Dyslexie, Lecture vocale rapide).
  - ✅ Centraliser la gestion des options via le panneau Options & Profils alimenté par `config.fields`.
  - ✅ Étendre `window.a11ytb.logActivity` avec exports JSON/CSV et tags thématiques.
  - ✅ Documenter le guide module et les manifestes (`docs/module-guide.md`, `docs/module-manifest.md`).
  - ✅ Industrialiser les tests automatisés (lint, Vitest, Playwright) exécutables via `npm run test`.
  - ✅ Livrer l’atelier design system (tokens CSS + kit Figma synchronisés).
  - ✅ Ajouter un focus trap complet avec isolation (`inert`) pour le panneau d’options.
- **Phase 1** :
  - ✅ Collections de modules : définition (`module-collections.js`), toggles accessibles, compteur d’état et propagation aux profils.
  - ✅ Chargement conditionnel : lazy-loading à l’activation, suivi `runtime.modules.<id>` et reprise après bascule.
  - ✅ Dépendances & compatibilité : calcul semver, badges dans l’admin, logs d’alertes/résolutions et métriques intégrées au centre d’état.
  - ✅ Historique versionné accessible dans le centre d’état ; ⏳ comparaison détaillée et collections imbriquées.
- **Phase 2 et suivantes** : observabilité temps réel multi-instance, profils dynamiques, catalogue distant et multi-tenant restent à spécifier et exécuter.

## Manques face à la concurrence

- **Audit automatisé continu** : l’analyse axe-core manuelle, ses exports et désormais une planification locale (heure, jour, semaine, fenêtre horaire) existent, et les parcours guidés FastPass couvrent les vérifications critiques ; le suivi multi-pages proposé par Accessibility Insights reste cependant absent.
- **Guidage** : la vue Guides propose désormais des checklists dynamiques inspirées des FastPass (prérequis, annonces `aria-live`, ressources). Il reste à scénariser des parcours utilisateurs complets et à ajouter des exports résumés.
- **Personnalisation avancée** : pas de duplication/partage de profils, ni de raccourcis personnalisables ou d’automations, contrairement à Stark.
- **Collaboration** : toujours aucune intégration Jira/Linear/Slack ni gestion multi-utilisateurs.
- **Observabilité** : les métriques runtime sont locales, désormais agrégées dans un indice de conformité AA/AAA consolidé **et dans un suivi d’historique manifestes**. Il manque encore l’agrégation historique multi-instance et des tableaux de bord partageables comme sur les plateformes enterprise.

> *Exemple* : le guide « Formulaire accessible » enchaîne désormais un précheck des prérequis (structure de formulaire, attributs ARIA requis), déclenche les tests automatiques (axe-core ciblé) puis propose des validations manuelles assistées (annonces clavier, revues visuelles). Cela le rapproche des FastPass, mais il manque encore la capture d'un scénario multi-pages et le co-tri des résultats avec un collègue dans l'interface.

## Webhooks d’activité & implications de sécurité

- **Activation** : l’écran d’administration expose désormais deux champs dans la section intégrations — `Webhook activité (URL)` et `Webhook activité (jeton)` — pour router le journal (`window.a11ytb.logActivity`) vers un endpoint HTTPS externe (connecteur Slack, fonction serverless, etc.). Une fois l’URL enregistrée, chaque entrée est poussée en JSON et un bouton « Envoyer au webhook » permet de relancer manuellement l’ensemble du journal depuis la vue Export.
- **Authentification** : le jeton optionnel est chiffré avec les salts WordPress côté base de données mais est ré-exposé côté frontal pour que le navigateur puisse insérer l’en-tête `Authorization: Bearer …`. Utiliser un secret dédié et révoquable, limiter l’IP source ou ajouter une validation côté serveur reste indispensable pour éviter qu’un visiteur ne détourne l’URL.
- **Résilience** : les envois sont mis en file d’attente avec relance exponentielle (2s → 30s). Chaque échec ou synchronisation manuelle est journalisé dans l’activité pour assurer la traçabilité sans masquer l’historique initial.

## Flux de synchronisation métriques (authentification & privacy)

- **Collecte côté runtime** : `setupModuleRuntime` sérialise désormais chaque échantillon de métriques avec horodatage, latences (load/init/total), compatibilité et incidents structurés. Le hook `onMetricsUpdate` permet à n’importe quel service d’observer les points (ex. télémétrie interne) sans avoir à sonder le store.
- **Service `createMetricsSyncService`** : l’agrégateur implémente des fenêtres temporelles (durée configurable) avec normalisation des scores (AAA/AA/…), consolidation par module et calcul des moyennes. Les paquets prêts à l’export sont publiés vers un backend via `fetch` (Bearer optionnel) ou stockés dans IndexedDB/localStorage en mode offline.
- **Résilience & confidentialité** : les tentatives sont limitées par un timeout configurable et retentées au retour du réseau (`online`, `beforeunload`, `visibilitychange`). Seuls les identifiants de module, des agrégats numériques et des incidents sans contenu utilisateur sont synchronisés pour éviter toute fuite de données personnelles ; la file locale est purgée à la demande.

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
   - Consolider `window.a11ytb.logActivity` avec historique filtrable, notifications FastPass et connecteurs d’export (copie presse-papiers, webhook, Jira/Linear).
   - Mutualiser les métriques runtime (latence, compatibilité, erreurs) dans un tableau de bord partageable.

6. **Conformité et UX**
   - Propager les contrôles de compatibilité navigateur via `runtime.modules.<id>.metrics` et exposer un score global AA/AAA.
   - Documenter les **bonnes pratiques d'usage** (limites modules, contextes recommandés) et enrichir la microcopie des Guides.

## Vision produit modulaire (2025-2028)

Cette feuille de route s'articule autour d'une interface d'administration ergonomique : un panneau configurateur drag & drop
permettant de composer l'expérience utilisateur et de cocher/décocher dynamiquement les modules à charger.

### Phase 0 – Socle (T1-T2 2025)

1. ✅ Concevoir un format `module.json` facultatif pour documenter les métadonnées (implémenté via `src/module-manifest.js` et
   fusion automatique des `defaults`).
2. ✅ Ajouter des profils d'accessibilité préconfigurés au store initial (Vision basse, Dyslexie, Lecture vocale rapide).
3. ✅ Centraliser la gestion des options (panneau dédié Options & Profils avec champs déclarés dans les manifestes).
4. ✅ Étendre `window.a11ytb.logActivity` pour exposer un journal exportable (JSON/CSV) et des tags (module, gravité).
5. ✅ Documenter le guide module (voir `docs/module-guide.md`).
6. ✅ Mettre en place des tests automatisés (lint déjà dispo) et prévoir des tests visuels/screenshot pour les nouveaux blocs.
7. ✅ Lancer un **atelier de design system** : définir palette + composants de base, livrer un kit Figma pour préparer l'implémentation.
8. ✅ Ajouter un **focus trap** complet avec isolation (`inert`) du reste de la page pour le panneau d'options.

### Phase 1 – Admin modulaire (T3 2025)

- ✅ Première itération du **builder drag & drop** livrée : liste réordonnable accessible (clavier, annonces live, souris/tactile) avec sauvegarde optimiste et rollback de base.
- ✅ **Collections de modules** disponibles (vision, audio, interaction) avec bascule globale, comptage des modules actifs et propagation dans les profils.
  - ⏳ Collections imbriquées et dépendances entre collections.
- ✅ **Chargement conditionnel** opérationnel : lazy-loading des modules à l’activation, suivi `runtime.modules` (états `ready/error/loading`) et notifications en cas d’échec.
  - ⏳ Panneau "Modules disponibles" dédié avec filtres avancés (profil, collection, compatibilité) et badges "requis/en conflit".
  - ✅ Déchargement sélectif (`unmount`) et stratégies de préchargement progressif (préchargement `idle`, visibilité des blocs, interaction pointeur).
- ✅ Vue **Dépendances & compatibilité** : calcul semver, badges automatiques, logs d’alertes/résolutions et accessibilité ARIA.
- ✅ Historique de versions visible côté UI (carte centre d’état détaillant mises à jour/rétrogradations) ; ⏳ diff des manifestes depuis l’interface.

### Prochaines itérations

- **Personnalisation avancée** : permettre la duplication/partage de profils, l’édition des raccourcis clavier et des presets audio détaillés.
- **Collections évoluées** : gérer les collections imbriquées, les dépendances entre collections et proposer des suggestions automatiques par profil.
- **Chargement conditionnel étendu** : vue dédiée "Modules disponibles", lazy-loading réseau granulaire et politique de cache/offline.
- **Instrumentation** : agréger les métriques runtime dans un tableau de bord (temps de chargement, compatibilité, erreurs) avec export partagé.
- **Audit enrichi** : séquencer des plans FastPass, permettre l’analyse multi-onglets et historiser les résultats.

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

1. ✅ Livrer le **panneau Modules disponibles** avec filtres (profil, collection, compatibilité) et badges "requis/en conflit".
2. ✅ Implémenter le **déchargement contrôlé** (`unmount`) et des stratégies de préchargement progressif pour réduire l’empreinte mémoire (livré : nettoyage module, préchargements `idle`/visibilité/pointeur).
3. ✅ Ouvrir la **duplication de profils** (création, sauvegarde, partage) et un premier lot de raccourcis personnalisables.
4. ✅ Agréger les **métriques runtime** dans le centre d’état (graphiques, tendances, export) avec score de conformité AA/AAA consolidé.
5. ✅ Connecter l’**audit axe-core** au journal d’activité (plans FastPass, historique des scans, notifications) et préparer les intégrations externes.
6. Formaliser le **processus de contribution modules** (template PR, checklist accessibilité/design system, validations automatiques dans la CI).
7. ✅ Calculer et exposer un **score de qualité des manifestes** (badge + recommandations dans la vue Modules disponibles) pour rapprocher la gouvernance des suites enterprise.

## Étapes moyen terme

- Automatiser les **scans d’accessibilité** (planification, comparaison de rapports, budget qualité).
- API plugin distants : installation de modules depuis un CDN signé avec sandbox et vérification des permissions.
- Gestion multilingue (i18n) du panneau drag & drop et du centre d’état.
- Parcours guidé **FastPass** étendu : notation par critère, export résumé et scénarios multi-pages.
- Synchronisation des préférences utilisateurs via stockage cloud sécurisé (multi-appareils).
- Lancement d'un **programme bêta** pour les modules tiers (audit sécurité, conformité RGPD, monitoring usage).

## Étapes long terme

- Intégration CI/CD (package npm + documentation) avec scénarios de tests modulaires automatisés et pipelines d’audit continus.
- Tableau de bord analytics (usage des modules, performance, conformité) exportable vers des outils BI.
- Publication d'un **design system public** (documentation + composants web) synchronisé avec le builder.
- Mise en place d'un **système de licences** et de partenariats pour les modules premium.
- Gouvernance multi-tenant (espaces organisationnels, workflow de validation, intégrations Jira/Linear/Slack).

Mise à jour : 2025-04-05
