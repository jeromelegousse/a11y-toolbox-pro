# Plan des priorités d'amélioration

## Priorité #1 – Finaliser l’accessibilité du panneau
- Mettre en place un focus trap complet pour empêcher la fuite du focus clavier hors du dialogue.
- Renforcer la gestion des attributs ARIA et les retours d’état pour indiquer clairement les transitions d’interface.
- Garantir une navigation fluide pour les utilisateurs clavier et technologies d’assistance lorsque le panneau est ouvert.

## Priorité #2 – Synchroniser l’UI du dock avec l’état persistant
- Lier chaque bouton du dock à un état `aria-pressed` conforme à son activation dans le store.
- Fournir une rétroaction visuelle cohérente avec les données persistées afin d’éviter les désynchronisations entre sessions.
- Tester la restauration d’état après rechargement pour valider l’expérience utilisateur continue.

## Priorité #3 – Renforcer les outils de qualité
- Ajouter Prettier et harmoniser la configuration ESLint existante pour disposer d’un formatage automatique fiable.
- Intégrer les linters et suites de tests dans la CI afin de détecter précocement les régressions.
- Prioriser les tests unitaires (store) et Playwright/Cypress pour l’UI afin de couvrir les parcours critiques.

## Priorité #4 – Améliorer la résilience produit
- Remplacer les `alert` bloquantes par des notifications non intrusives gérées par le système de design interne.
- Préparer une couche d’internationalisation centralisée pour faciliter l’ajout de nouvelles langues.
- Documenter un protocole de gestion des erreurs pour assurer une expérience cohérente en cas d’incident.
