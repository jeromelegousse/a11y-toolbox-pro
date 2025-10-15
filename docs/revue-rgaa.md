# Revue de code & conformité RGAA – A11y Toolbox Pro

## Méthodologie
- Lecture ciblée du plugin WordPress (`a11y-toolbox-pro.php`) et du front-end principal (`src/ui.js`, `src/registry.js`).
- Vérification rapide du lint JavaScript (`npm run lint:js`).
- Analyse manuelle des parcours utilisateurs clés : ouverture du panneau, navigation entre vues, affichage des modules et états de désactivation.

## Problèmes critiques identifiés
1. **Redéclaration fatale du chargeur de traductions**  
   La fonction `a11ytb_load_textdomain` est définie deux fois puis accrochée deux fois à `plugins_loaded`. PHP lève une erreur fatale « Cannot redeclare » qui empêche l’activation du plugin et donc toute fonctionnalité d’accessibilité côté client.【F:a11y-toolbox-pro.php†L25-L29】【F:a11y-toolbox-pro.php†L157-L161】

2. **Initialisation dupliquée lors de l’activation**  
   Deux hooks `register_activation_hook` sont déclarés : `a11ytb_on_activation` et `a11ytb_activate_plugin`. Ils initialisent tous deux les mêmes options par défaut, ce qui complique la maintenance et rend l’état d’activation plus difficile à déboguer en cas d’évolution. Les deux blocs devraient être fusionnés pour éviter des divergences futures.【F:a11y-toolbox-pro.php†L136-L185】

3. **Détection des éléments focalisables fragile**  
   La fonction `collectFocusable` filtre les éléments si leur `offsetParent` est `null`. Ce test exclut les éléments visibles positionnés en `fixed`, `sticky` ou `display:contents`, ce qui peut empêcher leur focus automatique lors de l’ouverture du panneau (ex. bouton fermer) et dégrader le respect du critère RGAA 7.1 sur la navigation clavier. Il est recommandé de remplacer ce test par `getBoundingClientRect()` ou `visibility` / `offsetWidth` pour ne filtrer que les éléments réellement invisibles.【F:src/ui.js†L6661-L6717】

## Constat de debugging
- `npm run lint:js` passe sans avertissement ni erreur, confirmant la cohérence syntaxique du code JavaScript revu.【4acc3f†L1-L6】

## Évaluation RGAA
### Points positifs
- Le bouton flottant et le panneau utilisent des rôles et attributs ARIA explicites (`aria-label`, `aria-expanded`, `role="dialog"`, `aria-modal`) avec retour du focus sur le déclencheur, ce qui sécurise l’ouverture/fermeture clavier (RGAA 7.1, 7.3).【F:src/ui.js†L941-L1010】【F:src/ui.js†L6661-L6731】
- Les cartes d’agrégation exposent des valeurs textuelles et des alternatives accessibles pour les graphiques SVG via `aria-label`, limitant la dépendance à la couleur seule (RGAA 3.3).【F:src/ui.js†L1159-L1193】

### Points de vigilance / non-conformités
1. **Commutateurs de vue assimilables à des onglets sans rôles adaptés**  
   Le sélecteur de vues utilise des boutons avec `aria-pressed` mais n’expose ni `role="tablist"` ni `aria-controls`. Les lecteurs d’écran ne reçoivent pas l’information qu’il s’agit d’un jeu d’onglets ni quelle vue est affichée, ce qui contrevient aux critères RGAA 9.2 et 9.3. Mettre en place le pattern ARIA « Tabs » (tablist/tab/tabpanel) ou annoncer explicitement le changement de région corrigerait le problème.【F:src/ui.js†L1534-L1610】【F:src/ui.js†L6120-L6154】

2. **Navigation clavier potentiellement bloquée par la filtration `offsetParent`**  
   Comme évoqué dans la section debugging, certains éléments visibles (ex. éléments `position:fixed` dans un mode plein écran) peuvent ne plus être ciblés lors du focus automatique. L’utilisateur clavier peut devoir tabuler plusieurs fois pour retrouver le contrôle attendu, ce qui remet en cause le critère RGAA 7.1. Adopter une détection basée sur `tabindex` et l’attribut `hidden` suffirait.【F:src/ui.js†L6661-L6717】

3. **Gestion administrative confuse lors de l’activation**  
   L’erreur fatale de redéclaration bloque l’activation de l’extension, empêchant toute mise en conformité RGAA sur le front. Corriger ce point est prioritaire avant d’évaluer des tests utilisateurs.【F:a11y-toolbox-pro.php†L25-L29】【F:a11y-toolbox-pro.php†L157-L161】

## Recommandations
- Supprimer la seconde définition de `a11ytb_load_textdomain` et regrouper l’initialisation des options dans une seule fonction appelée par le hook d’activation.
- Remplacer la logique `offsetParent !== null` par une vérification de visibilité plus robuste (`el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0`) pour ne pas exclure les éléments visibles.
- Repenser le sélecteur de vues comme un jeu d’onglets ARIA ou annoncer le changement de section via `aria-live`/`role="status"` pour garantir la conformité RGAA 9.x.
- Après corrections, compléter avec des tests utilisateurs (clavier, lecteur d’écran) et un audit automatisé (axe-core, Asqatasun) pour couvrir le référentiel RGAA complet.
