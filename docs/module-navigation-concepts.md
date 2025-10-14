# Propositions d'organisation de la barre de modules

## Principes d'accessibilité et de perception
- **Charge cognitive minimale** : limiter le nombre d'éléments visibles simultanément, grouper par logique fonctionnelle et fournir des repères visuels constants (titres, icônes, badges).
- **Navigation à deux vitesses** : combiner une consultation rapide des outils principaux et un accès approfondi aux fonctionnalités secondaires.
- **Interaction prévisible** : transitions douces, absence de mouvement non sollicité, focus visible, et raccourcis clavier cohérents.

## Inspirations d'applications reconnues
- **Figma / Notion** : sidebars modulaires avec sections repliables, icônes + libellés, et hiérarchie claire.
- **Linear / Superhuman** : filtres contextuels et navigation par panneau, minimisant l'encombrement visuel.
- **Arc Browser / Raycast** : approche "command palette" pour une recherche instantanée des modules.

Ces références montrent l'intérêt d'une structure en panneaux superposés : un rail principal pour l'orientation, une colonne contextuelle pour le détail, et un contenu central focalisé.

## Pistes de présentation

### 1. Sidebar bi-colonne
- **Colonne primaire (48-56px)** : icônes des familles de modules (Analyse, Tests, Monitoring, etc.) accessibles clavier + lecteur d'écran via `aria-label`.
- **Colonne secondaire (220-280px)** : liste repliable des modules appartenant à la famille sélectionnée, avec regroupements (core, add-ons, beta).
- **Zone principale** : contenu du module ; un en-tête fixe rappelle la hiérarchie et offre des actions rapides (favoris, partage, aide).

### 2. Mode compact
- **Palette rapide** (Ctrl/Cmd + K) : rechercher et activer un module sans quitter le clavier.
- **Barre horizontale** en haut pour les modules favoris ou récemment utilisés.

### 3. Mode focus
- Possibilité d'élargir la colonne secondaire ou de masquer la colonne primaire pour des sessions prolongées dans un module spécifique.
- Historique de navigation récent sous forme de fil d'Ariane.

## Menu d'administration drag-and-drop

### Objectifs
- Gérer dynamiquement l'arborescence des modules.
- Permettre la création de dossiers, sous-dossiers, et l'activation/désactivation par profil utilisateur.

### Inspirations
- **WordPress Gutenberg** : interface de réorganisation par drag-and-drop, avec aperçu des positions.
- **Asana / Trello** : métaphores de cartes et colonnes faciles à appréhender.

### Propositions d'interface
1. **Liste hiérarchique** : chaque module est une carte avec poignée de drag (`aria-grabbed`) et options (paramètres, visibilité, alias).
2. **Sous-menus imbriqués** : glisser un module sur un autre crée un sous-menu ; indiquer la profondeur par indentation et connecteurs.
3. **Mode édition** : basculer la sidebar en mode édition, affichant uniquement les éléments manipulables et un panneau de propriétés à droite (description, tags, droits d'accès).
4. **Aperçu en temps réel** : prévisualisation de la future structure dans une fenêtre simulant la barre utilisateur.

### Accessibilité
- Prise en charge du clavier (touches fléchées, barre d'espace pour saisir, entrée pour déposer).
- Annonces ARIA (`aria-live`) lors de la réorganisation.
- Feedback visuel contrasté pour la position cible (ligne, couleur d'arrière-plan).

## Gestion de la modularité
- **Tags et filtres** : chaque module peut exposer ses attributs (type d'assistance, public cible, statut de maturité) pour filtrage rapide.
- **Profilage utilisateur** : la barre propose automatiquement les modules pertinents selon le rôle (développeur, auditeur, rédacteur).
- **API de composition** : prévoir un schéma JSON décrivant l'arborescence afin de synchroniser l'UI, l'admin et les exports.

## Roadmap suggérée
1. Prototype Figma des variantes (double colonne, mode compact, mode focus).
2. Tests utilisateurs (personnes en situation de handicap cognitif) avec scénarios de navigation.
3. Implémentation progressive : ajout du rail principal, puis du panneau secondaire, puis de la palette rapide.
4. Intégration du mode drag-and-drop dans l'admin avec instrumentation d'accessibilité (tests assistés par axe-core).

Ces orientations visent à concilier modularité, cohérence visuelle et confort cognitif, tout en maintenant des interactions accessibles et évolutives.
