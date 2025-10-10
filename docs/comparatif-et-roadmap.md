# Comparatif avec des solutions professionnelles et pistes d'amélioration

Cette note sert de base pour situer A11y Toolbox Pro par rapport aux extensions d'accessibilité professionnelles et pour lister des évolutions prioritaires. Elle est amenée à vivre : mettez-la à jour à chaque itération majeure.

## Solutions observées

| Solution | Fonctionnalités marquantes | Positionnement |
| --- | --- | --- |
| **Deque axe DevTools** | Audit WCAG automatisé (DOM + contrastes), génération de rapports partageables, intégration CI/CD, tri par gravité | Outil expert pour développeurs et QA |
| **Microsoft Accessibility Insights** | Parcours guidés (FastPass), capture de scénarios, intégration GitHub/Azure Boards, suggestions de correctifs | Audit guidé multi-profils (dev, test, design) |
| **Stark** | Vérifications contraste/couleurs, simulation Daltonisme, export Figma/Sketch, collaboration équipe | Outil design + produit |
| **EqualWeb / accessiBe toolbars** | Barre flottante grand public, personnalisation UI (taille texte, espacement, curseurs, TTS), profils pré-configurés | Ciblent l'utilisateur final |

## Écarts actuels

- **Portée fonctionnelle** : la démo couvre surtout quelques actions temps réel (TTS, STT, contraste, espacement) mais n'exécute ni audit automatique ni export de rapports comme axe DevTools ou Accessibility Insights.
- **Personnalisation** : il manque des profils prêts à l'emploi (dyslexie, vision basse, etc.) et des options fines (voix TTS, raccourcis personnalisables) présentes chez Stark ou les toolbars commerciales.
- **Collaboration** : aucun historique ou export n'est prévu alors que les solutions professionnelles proposent des logs partageables et des intégrations outils.
- **Gouvernance modules** : le registre est simple (`registerModule`, `registerBlock`) mais n'intègre pas de gestion de versions ou de dépendances, ce qui limite la scalabilité face aux bibliothèques modulaires plus matures.

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

4. **Collaboration et observabilité**
   - Étendre `window.a11ytb.logActivity` pour exposer un journal exportable (JSON/CSV) et un système de tags (module, gravité).
   - Prévoir des connecteurs d'export (copie presse-papiers, webhook) pour se rapprocher des intégrations axe/Insights.

5. **Conformité et UX**
   - Ajouter une vérification de compatibilité navigateur (p. ex. fallback lorsqu'`speechSynthesis` est indisponible est déjà gérée mais pourrait être propagée sous forme d'état global `compat.features`).
   - Définir un design system léger pour garantir la cohérence visuelle entre modules.

## Étapes court terme

1. ✅ Concevoir un format `module.json` facultatif pour documenter les métadonnées (implémenté via `src/module-manifest.js` et
   fusion automatique des `defaults`).
2. Ajouter des profils d'accessibilité préconfigurés au store initial (ex : `state.tx({ profiles: {...} })`).
3. Centraliser la gestion des options (panneau dédié) et permettre à chaque module d'y injecter ses champs.
4. Documenter le guide module (voir `docs/module-guide.md`).
5. Mettre en place des tests automatisés (lint déjà dispo) et prévoir des tests visuels/screenshot pour les nouveaux blocs.

## Étapes moyen terme

- Scanner d'accessibilité (intégration axe-core ou Pa11y) pour produire des rapports.
- API plugin distants : charger des modules depuis un CDN signé.
- Gestion multilingue (i18n) afin de couvrir les marchés ciblés.

## Étapes long terme

- Intégration CI/CD (npm package + documentation d'intégration). 
- Tableau de bord analytics (statistiques d'usage des modules) dans le respect RGPD.

Mise à jour : 2025-10-10
