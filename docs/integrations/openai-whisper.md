# Intégration OpenAI Whisper API

Cette intégration permet de lancer rapidement des transcriptions via l'API OpenAI (`gpt-4o-mini-transcribe`), en s'appuyant sur le socle commun (`fetchWithRetry`, gestion `.env`).

## Prérequis

- Node.js 18+
- Clé `OPENAI_API_KEY` renseignée dans `.env.local` (voir `docs/credentials/README.md`).
- Fichier audio encodé en WAV/MP3/MP4/M4A (mono recommandé).

## Commande de démonstration

```bash
npm run demo:stt -- --file=./data/samples/fr-demo.wav [--language=fr]
```

Options disponibles :

- `--file` (**obligatoire**) : chemin vers le fichier audio à transcrire.
- `--language` (optionnel) : code ISO de la langue (ex: `fr`, `en`).
- `--engine` (optionnel) : par défaut `openai-whisper`. Les futurs moteurs seront ajoutés à la même CLI.

La commande affiche un objet JSON minimal contenant l'identifiant du moteur, le fichier traité et le texte transcrit.

## Fonctionnement interne

- `scripts/integrations/demo-stt.js` : CLI légère qui charge les variables d'environnement et délègue la transcription au moteur sélectionné.
- `src/integrations/stt/openai-whisper.js` : implémente l'interface `SpeechEngine` (fonction `transcribe`).
- Les appels HTTP utilisent `fetchWithRetry` pour gérer les erreurs réseau et appliquer un timeout de 30s.

## Évolutions prévues

- Support des paramètres OpenAI avancés (`temperature`, `prompt`, etc.).
- Sauvegarde automatique des transcriptions dans `reports/stt/`.
- Ajout d'autres moteurs dans la map `ENGINES` (Deepgram, AssemblyAI...).
