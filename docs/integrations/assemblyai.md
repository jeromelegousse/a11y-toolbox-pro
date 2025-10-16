# Intégration AssemblyAI

L'intégration AssemblyAI automatise l'envoi d'un fichier audio, la création de job de transcription et le polling jusqu'à l'obtention du texte final. Elle repose sur les utilitaires maison (`fetchWithRetry`, `parseJson`, gestion `.env`) pour simplifier les tests.

## Prérequis

- Node.js 18+
- Clé `ASSEMBLYAI_API_KEY` disponible dans `.env.local` ou `.env`
- Fichier audio en WAV/MP3 (mono recommandé)

## Commande de démonstration

```bash
npm run demo:stt -- \
  --engine=assemblyai \
  --file=./data/samples/fr-interview.wav \
  --language=fr \
  --diarize=true \
  --pollIntervalMs=500 \
  --maxPolls=10
```

Paramètres disponibles :

- `--language` : code langue AssemblyAI (ex. `en_us`, `fr`).
- `--diarize` : active les étiquettes de locuteur (`speaker_labels`).
- `--pollIntervalMs` : délai entre deux requêtes de statut (défaut 1000 ms).
- `--maxPolls` : nombre maximum d'essais avant expiration.

## Fonctionnement interne

1. Téléversement du fichier vers `https://api.assemblyai.com/v2/upload`.
2. Création du job (`POST /v2/transcript`).
3. Boucle de polling (`GET /v2/transcript/{id}`) jusqu'au statut `completed` ou `error`.

Les erreurs sont levées si l'une des étapes renvoie un payload incomplet ou si la transcription n'est pas terminée dans le temps imparti.

## Notes

- L'API accepte des fichiers volumineux : adapter `maxPolls`/`pollIntervalMs` pour les fichiers de plusieurs minutes.
- Pour accélérer les tests automatisés, utilisez `--pollIntervalMs=0` afin de désactiver l'attente entre deux tentatives.
