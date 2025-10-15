# A11y Toolbox Pro (démo)

- Marge de sécurité via `--a11ytb-safe-margin` + `env(safe-area-inset-*)`
- Dock gauche/droite/bas
- Système de blocs (inspiration WordPress)
- Modules : TTS, STT (si dispo), Braille (grade 1 simpl.), Contraste, Espacements
- Réglage de la langue préférée pour la synthèse vocale avec détection automatique des voix
- Panneau « Options & Profils » : profils Vision/Dyslexie/Lecture rapide + réglages centralisés (TTS, Espacements, Contraste)
- Vue « Guides » (Alt+Shift+P) avec checklists d’onboarding et suivi d’avancement
- Vue « Raccourcis » (Alt+Shift+H) listant les commandes clavier globales et contextuelles
- Centre d’état vocal/braille en temps réel pour signaler disponibilités, erreurs et modules désactivés
- Journal d'activité exportable (JSON/CSV) avec tags module/sévérité (`window.a11ytb.activity`)
- Menu admin avancé : activation globale, dock par défaut, vue initiale, ouverture automatique et intégration Gemini (clé API + suivi de quota)
- Store observable + localStorage (`a11ytb/v1`)
- Compat : fonctions globales `speakSelection`, `speakPage`, `stopSpeaking`, `brailleSelection`, `clearBraille`, `resetAll` + getters `sttStatus`, `brailleOut`

Ouvrez `index.html` dans un navigateur moderne (Alt+Shift+A pour ouvrir).

## Développement

```bash
npm install
```

> ℹ️ L'installation télécharge automatiquement les navigateurs Playwright nécessaires aux tests visuels (`playwright install`).

```bash
npm run lint:manifests
```

> ℹ️ Ce script compare la qualité des manifestes aux suites professionnelles (axe DevTools, Accessibility Insights, Stark) et doit rester vert avant toute contribution.

Ensuite, vous pouvez lancer les vérifications locales :

```bash
npm run test
```

## Installation comme extension WordPress

1. Téléchargez l’archive du dépôt (`Code` → `Download ZIP`).
2. Dans l’administration WordPress, allez dans **Extensions → Ajouter → Téléverser** puis sélectionnez `a11y-toolbox-pro-main.zip`.
3. WordPress vérifie automatiquement les prérequis (PHP 7.4+, WordPress 6.2+). En cas d’écart, l’activation est bloquée avec un message clair — conformément aux guidelines officielles.
4. Une fois les prérequis validés, WordPress détecte le fichier `a11y-toolbox-pro.php`, installe l’extension et crée les options par défaut. Activez-la pour injecter l’interface sur votre site.
5. Si besoin, utilisez le filtre `a11ytb/is_enabled` dans votre thème pour conditionner le chargement (par exemple uniquement sur certaines pages).

Une fois l’extension activée, un menu **A11y Toolbox Pro** apparaît dans l’administration WordPress. Vous y trouverez un guide rapide, les raccourcis clavier principaux ainsi qu’un aperçu interactif pour tester la barre latérale sans quitter l’admin.


