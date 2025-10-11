# Atelier Design System – A11y Toolbox Pro

Ce document synthétise la palette, les composants prioritaires et la livraison du kit Figma afin d’aligner les développements front.

## 1. Principes directeurs

1. Contraste AA minimum (niveau AAA visé pour les textes critiques).
2. Réduction de la charge cognitive : peu de variantes, hiérarchie claire.
3. États focus visibles et cohérents (couleur + halo 2px).
4. Compatibilité dark/light à moyen terme (tokens prêts).

## 2. Palette de base

| Token | Usage | Couleur (hex) | Contraste sur #FFFFFF |
| --- | --- | --- | --- |
| `--color-bg` | Fond principal | `#0F172A` | 13.9:1 |
| `--color-surface` | Panneaux | `#111827` | 12.6:1 |
| `--color-surface-alt` | Cartes secondaires | `#1F2937` | 9.1:1 |
| `--color-primary` | Actions principales | `#38BDF8` | 3.1:1 (utiliser sur fond sombre) |
| `--color-primary-strong` | Focus ring / hover | `#0EA5E9` | 4.4:1 |
| `--color-accent` | États positifs | `#22C55E` | 4.7:1 |
| `--color-warning` | États attention | `#F59E0B` | 3.2:1 |
| `--color-danger` | États critiques | `#F97316` | 3.4:1 |
| `--color-text` | Texte principal | `#F8FAFC` | 15:1 |
| `--color-text-muted` | Texte secondaire | `#CBD5F5` | 7.8:1 |
| `--color-border` | Traits séparateurs | `#334155` | 5.4:1 |

### Gradients et tokens dérivés

- `--color-primary/05-90` générés dans le kit Figma pour états hover/pressed.
- Échelles de gris `slate-900` à `slate-200` pour background/panneaux.

## 3. Typographie & espacement

| Token | Valeur | Usage |
| --- | --- | --- |
| `--font-family-sans` | "Inter", "Segoe UI", sans-serif | UI principale |
| `--font-size-xs` | 12px | badges, infos secondaires |
| `--font-size-sm` | 14px | labels de contrôle |
| `--font-size-base` | 16px | corps de texte |
| `--font-size-lg` | 18px | titres de cartes |
| `--radius-sm` | 6px | boutons, chips |
| `--radius-lg` | 12px | panneaux, cartes |
| `--space-unit` | 8px | grille 8pt (multiples) |

## 4. Composants prioritaires

| Composant | Description | États |
| --- | --- | --- |
| Bouton primaire | Fond `--color-primary`, texte `--color-text`, radius `--radius-sm` | repos / hover (`--color-primary-strong`) / focus ring (2px `--color-primary-strong`) / disabled (opacité 0.4) |
| Bouton ghost | Fond transparent, bord `--color-border`, texte `--color-text` | repos / hover (fond `--color-surface-alt`) / focus |
| Chip (filtre) | Capsule avec outline `--color-border`, texte `--color-text-muted`, version active : fond `--color-primary-strong` | repos / active / focus |
| Carte module | Surface `--color-surface`, padding `2 * --space-unit`, ombre `0 8px 24px rgba(15,23,42,.24)` | repos / disabled (overlay + `--color-surface-alt`) |
| Form field (toggle, select) | Label 14px, description 12px, fond `--color-surface-alt`, focus ring `--color-primary-strong` | repos / focus / disabled |
| Barre d’activités | Texte 14px, séparateurs `--color-border`, badges tonalités (success/danger) | normal / vide |

Chaque composant est documenté dans le kit Figma avec ses variantes (Auto Layout + tokens). Les noms de variantes suivent la convention `component/state/size`.

## 5. Kit Figma

- Fichier : `assets/design-system/a11y-toolbox-figma-kit.fig.base64` (gabarit minimal : manifest + tokens). Décoder via `base64 -d assets/design-system/a11y-toolbox-figma-kit.fig.base64 > a11y-toolbox-figma-kit.fig`, puis importer le `.fig` obtenu dans Figma via **File > Import**.
- Le fichier contient :
  - Page `🎨 Tokens` avec les styles de couleurs/typo (nommage identique aux tokens ci-dessus).
  - Page `🧱 Composants` avec les variants (boutons, chips, cartes, champs).
  - Page `📐 Layout` proposant une grille 8pt et exemples de panneaux.
- Les tokens sont également disponibles en JSON (`assets/design-system/figma-kit.tokens.json`) pour intégration via le plugin *Tokens Studio*.
- Un export CSS vivant (`src/css/design-tokens.css`) expose les mêmes variables pour l’interface web ; il est importé par `src/css/styles.css` et doit rester synchronisé avec le kit.
- À chaque évolution : mettre à jour le `.fig` + JSON, incrémenter la version en commentaire et noter la date.

## 6. Prochaines étapes atelier

1. Ateliers d’alignement : revue palette + composants avec les équipes accessibilité & design.
2. Étendre la bibliothèque aux icônes (Mono 24px) et aux feedbacks sonores (mapping tons → couleurs).
3. Préparer l’export `design-tokens.css` à consommer directement dans `src/css/styles.css`.

Ce document sert de référence pour tout nouveau travail UI et doit être tenu à jour après chaque atelier.
