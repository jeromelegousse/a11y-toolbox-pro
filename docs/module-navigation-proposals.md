# Refonte de la présentation des modules

Ce document synthétise des idées pour alléger la charge cognitive de la barre de modules et renforcer le caractère modulaire de l'application. Il s'appuie sur un benchmark d'applications d'accessibilité reconnues et propose plusieurs pistes d'organisation pour l'interface principale et l'espace d'administration.

## 1. Benchmark UI de références accessibilité

| Produit                              | Points forts de navigation                                                                                                                                                                                                    | Points d'attention                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **macOS Réglages d'accessibilité**   | Sections groupées par besoin (Vision, Audition, Motricité) avec une double colonne: la première colonne liste les sections, la seconde affiche les réglages du module sélectionné. Utilise des icônes et des libellés courts. | Les listes longues deviennent lourdes sans filtres.                                     |
| **Microsoft Accessibility Insights** | Panneau latéral à deux niveaux: le premier niveau affiche les modes (Rapide, Automatisé, Explorer), le second affiche des sous-fonctions. Barre de recherche persistante.                                                     | Peu de feedback sur l'état des modules lorsque plusieurs sont actifs.                   |
| **Stark Suite**                      | Navigation par onglets latéraux avec sous-catégories repliables. Les modules critiques sont épinglés en tête avec un badge « Recommended ».                                                                                   | Les icônes seules ne suffisent pas: Stark combine systématiquement texte + pictogramme. |
| **axe DevTools**                     | Arborescence collapsible avec regroupement par contextes d'audit (Violations, Best Practices). Offre des raccourcis clavier pour chaque section et un résumé compact.                                                         | Les intitulés techniques peuvent rebuter sans micro-contenus d'aide.                    |

Points communs observés:

- **Affordances claires** : icônes accompagnées de texte, segmentation visuelle forte, surfaces interactives larges.
- **Progressive disclosure** : les options avancées restent cachées tant que non requises.
- **Filtres rapides** : recherche ou puces permettant de filtrer rapidement les modules.
- **Feedback instantané** : statut actif/désactivé indiqué visuellement (badge, switch, barre de progression).

## 2. Propositions pour la barre de modules

### 2.1 Sidebar double colonne

- **Colonne primaire (40 % largeur)** : liste verticale des catégories de modules (« Vision », « Lecture », « Interaction », « Administration »). Chaque entrée combine icône, titre et compteur de modules actifs. Possibilité d'ajouter un champ de recherche/filtres en tête.
- **Colonne secondaire (60 % largeur)** : affiche les modules appartenant à la catégorie sélectionnée sous forme de cartes compactes (titre, description courte, switch d'activation). Un module sélectionné ouvre un panneau de détails dans la même colonne (accordéon) ou en overlay.
- **Aide contextuelle** : un bandeau « Comment choisir ? » avec un lien vers des guides selon le profil utilisateur.
- **Raccourcis clavier** : `Ctrl + 1/2/3...` pour naviguer entre catégories, `Ctrl + F` focalise la recherche.

### 2.2 Vue mosaïque avec regroupement visuel

- Présenter les modules sous forme de **groupes expansibles** (component pattern « Accordion navigation ») alignés en grille responsive 2 colonnes.
- Chaque groupe possède un en-tête accessible (`button` + `aria-expanded`). À l'ouverture, les modules se dévoilent sous forme de lignes avec switch, actions rapides et microcopie.
- Ajouter des **capsules** (chips) pour indiquer les profils ciblés (ex. « Dyslexie », « Daltonisme ») afin d'aider le tri.

### 2.3 Barre compacte + panneau latéral flottant

- Maintenir une **barre de lancement minimaliste** à gauche avec uniquement les icônes (plus aisée pour écrans étroits), couplée à un **panneau flottant** qui s'ouvre par-dessus pour gérer les modules.
- Le panneau flottant reprendra la structure double colonne décrite en 2.1 et se refermera automatiquement après validation pour réduire l'encombrement.
- Utile pour les utilisateurs experts qui connaissent déjà l'iconographie mais qui ont besoin d'un accès rapide.

## 3. Refonte de l'admin et du drag-and-drop

### 3.1 Menu hiérarchique modulable

- Utiliser un **tree view ARIA** (`role="tree"`, `role="treeitem"`, `aria-expanded`) pour représenter les modules et sous-modules.
- Permettre de **réordonner par glisser-déposer** via des poignées (`button` avec `aria-grabbed` et support clavier) et de déposer dans des sous-sections.
- Les sous-menus représentent les **contextes d'utilisation** (ex. « Lecture à voix haute », « Personnalisation visuelle »). Un module peut être dupliqué dans plusieurs branches via des alias.

### 3.2 Panneau de métadonnées

- Lorsqu'un module est sélectionné dans l'arborescence, un panneau à droite affiche: description, permissions, dépendances, état (beta/stable), statistiques d'usage.
- Boutons d'action rapides: activer/désactiver, définir comme recommandé, épingler pour les profils spécifiques.

### 3.3 Gabarit de sous-menus personnalisables

- Autoriser la création de **collections de modules** (ex. « Profil Dyslexie »). Ces collections se matérialisent comme des sous-menus dans la barre principale.
- En administration, proposer un **builder en drag-and-drop** avec trois colonnes : modules disponibles, modules dans la collection, aperçu de l'ordre final.
- Supporter des **règles d'affichage conditionnel** (ex. « Afficher ce module uniquement si le profil courant a besoin de synthèse vocale »).

## 4. Recommandations UX transverses

- **Microcopies claires** : chaque module doit avoir un titre court et une description actionnable (« Augmente le contraste des textes pour un meilleur confort visuel »).
- **État par défaut** : désactiver tous les modules non essentiels pour éviter la surcharge initiale. Proposer un bouton « Tout activer pour explorer ».
- **Historique d'actions** : afficher les dernières modifications (activation, ré-ordonnancement) avec possibilité d'annuler.
- **Mode démo / onboarding** : proposer un mode guide qui présente les modules par étapes selon le profil utilisateur.
- **Sauvegarde de layouts** : permettre d'enregistrer plusieurs agencements (profils) et de basculer rapidement entre eux depuis la colonne primaire.

## 5. Prochaines étapes

1. Prototyper la double colonne en Figma avec un exemple de 8–10 modules et valider la densité.
2. Tester une version « barre compacte + panneau flottant » sur mobile/tablette pour vérifier la lisibilité et l'accessibilité clavier.
3. Définir le schéma JSON de configuration des collections/sous-menus pour alimenter l'admin drag-and-drop.
4. Préparer une session utilisateurs (personnes malvoyantes et dyslexiques) pour mesurer l'impact sur la compréhension.

Ces propositions visent à réduire l'effort cognitif tout en conservant la flexibilité modulaire de l'application. Elles peuvent être combinées (ex. double colonne accessible depuis le panneau flottant, tree view administrateur pour configurer les catégories).
