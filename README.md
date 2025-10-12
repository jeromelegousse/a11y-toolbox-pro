# A11y Toolbox Pro (démo)

- Marge de sécurité via `--a11ytb-safe-margin` + `env(safe-area-inset-*)`
- Dock gauche/droite/bas
- Système de blocs (inspiration WordPress)
- Modules : TTS, STT (si dispo), Braille (grade 1 simpl.), Contraste, Espacements
- Panneau « Options & Profils » : profils Vision/Dyslexie/Lecture rapide + réglages centralisés (TTS, Espacements, Contraste)
- Vue « Guides » (Alt+Shift+P) avec checklists d’onboarding et suivi d’avancement
- Vue « Raccourcis » (Alt+Shift+H) listant les commandes clavier globales et contextuelles
- Centre d’état vocal/braille en temps réel pour signaler disponibilités, erreurs et modules désactivés
- Journal d'activité exportable (JSON/CSV) avec tags module/sévérité (`window.a11ytb.activity`)
- Store observable + localStorage (`a11ytb/v1`)
- Compat : fonctions globales `speakSelection`, `speakPage`, `stopSpeaking`, `brailleSelection`, `clearBraille`, `resetAll` + getters `sttStatus`, `brailleOut`

Ouvrez `index.html` dans un navigateur moderne (Alt+Shift+A pour ouvrir).

## Installation comme extension WordPress

1. Téléchargez l’archive du dépôt (`Code` → `Download ZIP`).
2. Dans l’administration WordPress, allez dans **Extensions → Ajouter → Téléverser** puis sélectionnez `a11y-toolbox-pro-main.zip`.
3. WordPress détecte maintenant le fichier `a11y-toolbox-pro.php` et installe l’extension sans erreur. Activez-la pour injecter l’interface sur votre site.
4. Si besoin, utilisez le filtre `a11ytb/is_enabled` dans votre thème pour conditionner le chargement (par exemple uniquement sur certaines pages).


