# Intégration de Gemini 2.5 Computer Use Preview

Le modèle **Gemini 2.5 Computer Use Preview** peut être envisagé pour automatiser certaines tâches de navigation web dans le cadre d'une application d'accessibilité. Toutefois, en raison de son statut Preview et des contraintes de sécurité qui en découlent, il ne peut pas être utilisé comme une solution totalement autonome. Cette note résume les points à considérer avant toute intégration.

## Cas d'usage possibles

- Aider un utilisateur à automatiser des parcours web répétitifs (remplir des formulaires, naviguer dans des tableaux de bord) en complément d'une assistance humaine.
- Prototyper rapidement des tests de parcours utilisateur pour vérifier l'ergonomie d'une interface.
- Effectuer des recherches multi-sites afin de rassembler des informations que l'application peut ensuite restituer sous une forme accessible.

Dans tous les cas, le modèle doit rester sous supervision humaine (Human-in-the-loop) pour garantir la sécurité des actions déclenchées et la conformité réglementaire.

## Contraintes et limites

- **Statut Preview** : le modèle peut générer des erreurs ou des actions inattendues. Il ne doit pas être utilisé pour des décisions critiques ou des tâches irréversibles sans contrôle humain.
- **Contexte sécurité** : il faut implémenter une boucle de confirmation dès que l'API renvoie `require_confirmation`. L'utilisateur final ou un opérateur doit valider manuellement toute action jugée risquée.
- **Environnement isolé** : exécuter le contrôleur dans un bac à sable (VM, conteneur) pour éviter l'accès direct aux systèmes de production ou aux données sensibles.
- **Maintenance** : surveiller les mises à jour du modèle (version `gemini-2.5-computer-use-preview-10-2025`). Les changements peuvent affecter la compatibilité de l'intégration.

## Prérequis techniques

1. **Client Gemini** : utiliser le SDK officiel `google-genai` ou l'API HTTP avec l'outil `computer_use` activé. La requête doit inclure la capture d'écran courante et l'objectif utilisateur.
2. **Gestionnaire d'actions** : implémenter côté client les actions UI standard (`open_web_browser`, `click_at`, `type_text_at`, etc.) ainsi que toute fonction personnalisée utile. Les coordonnées retournées sont normalisées (0-999) et doivent être converties en pixels avant exécution.
3. **Capture d'état** : après chaque action, envoyer une capture d'écran et l'URL courante via `FunctionResponse` afin de maintenir la boucle d'agent.
4. **Journalisation** : consigner les requêtes, actions exécutées, captures et décisions de sécurité pour pouvoir auditer et diagnostiquer les comportements du modèle.

## Recommandations d'intégration pour A11y Toolbox Pro

- Positionner le modèle comme un **assistant supervisé** qui propose des actions à l'utilisateur ou à un conseiller humain, plutôt que comme un pilote autonome de l'interface cible.
- Restreindre la surface d'action en définissant des listes d'autorisations pour les sites et interactions acceptées, afin de limiter les risques d'exfiltration ou d'automatisation abusive.
- Coupler le moteur avec les modules existants d'accessibilité (lecture d'écran, raccourcis personnalisés) pour offrir un retour d'information fiable après chaque action proposée.
- Prévoir des tests réguliers avec des scénarios réels et des utilisateurs cibles pour vérifier que l'assistant n'introduit pas de régressions d'accessibilité ou de confusion dans la navigation.

## Réponse à la question

Vous pouvez intégrer l'API Gemini 2.5 Computer Use Preview dans l'application, mais uniquement en respectant des garde-fous stricts : supervision humaine constante, environnement isolé, confirmation explicite des actions sensibles et journalisation complète. Sans ces précautions, l'intégration n'est pas recommandée pour un produit d'accessibilité en production.
