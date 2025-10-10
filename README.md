# A11y Toolbox Pro (démo)

- Marge de sécurité via `--a11ytb-safe-margin` + `env(safe-area-inset-*)`
- Dock gauche/droite/bas
- Système de blocs (inspiration WordPress)
- Modules : TTS, STT (si dispo), Braille (grade 1 simpl.), Contraste, Espacements
- Store observable + localStorage (`a11ytb/v1`)
- Compat : fonctions globales `speakSelection`, `speakPage`, `stopSpeaking`, `brailleSelection`, `clearBraille`, `resetAll` + getters `sttStatus`, `brailleOut`

Ouvrez `index.html` dans un navigateur moderne (Alt+Shift+A pour ouvrir).

## Documentation produit

- [Comparatif et roadmap](docs/comparatif-et-roadmap.md) — synthèse des écarts avec les solutions professionnelles et priorisation des évolutions.
- [Guide de modules](docs/module-guide.md) — conventions pour créer et maintenir des modules/blocs sans casser l'existant.

## Qualité du code

Des scripts npm sont disponibles pour vérifier la qualité :

```bash
npm install
npm run lint    # ESLint + Stylelint
```
