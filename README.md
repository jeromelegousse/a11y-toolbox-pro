# A11y Toolbox Pro (démo)

- Marge de sécurité via `--a11ytb-safe-margin` + `env(safe-area-inset-*)`
- Dock gauche/droite/bas
- Système de blocs (inspiration WordPress)
- Modules : TTS, STT (si dispo), Braille (grade 1 simpl.), Contraste, Espacements
- Store observable + localStorage (`a11ytb/v1`)
- Compat : fonctions globales `speakSelection`, `speakPage`, `stopSpeaking`, `brailleSelection`, `clearBraille`, `resetAll` + getters `sttStatus`, `brailleOut`

Ouvrez `index.html` dans un navigateur moderne (Alt+Shift+A pour ouvrir).

## Dépannage

### Erreur « Création de branche non autorisée pour ce référentiel »

Cette erreur provient de GitHub et signifie que votre compte n’a pas la
permission de créer des branches directement sur le dépôt distant. Pour la
résoudre :

1. **Vérifiez vos droits** : assurez-vous d’être membre de l’organisation ou
   d’avoir un rôle qui autorise la création de branches. Si besoin, demandez au
   mainteneur de vous accorder les droits `push`.
2. **Travaillez depuis un fork** : si vous ne pouvez pas obtenir les droits,
   créez un fork du dépôt via l’interface GitHub, clonez ce fork localement,
   puis poussez vos branches vers ce fork avant d’ouvrir une Pull Request vers
   le dépôt principal.
3. **Contrôlez le dépôt distant** : vérifiez que `git remote -v` pointe vers le
   dépôt sur lequel vous avez les permissions. Utilisez `git remote set-url`
   pour remplacer l’URL par celle de votre fork le cas échéant.

Après avoir mis à jour vos autorisations ou votre dépôt distant, relancez la
commande Git pour créer et pousser votre branche.