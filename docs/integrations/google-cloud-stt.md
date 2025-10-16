# Intégration Google Cloud Speech-to-Text

Ce connecteur appelle l'API `speech:recognize` de Google Cloud à l'aide d'un compte de service. L'authentification est réalisée via un JWT signé côté serveur puis échangé contre un access token OAuth2, le tout encapsulé dans nos utilitaires maison.

## Prérequis

- Node.js 18+
- Fichier JSON de compte de service (`GOOGLE_APPLICATION_CREDENTIALS`) avec les rôles Speech-to-Text
- Le fichier peut être référencé dans `.env.local` : `GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcp-service-account.json`
- Fichier audio WAV/FLAC/LINEAR16 (16 kHz recommandé)

## Commande de démonstration

```bash
npm run demo:stt -- \
  --engine=google-cloud-stt \
  --file=./data/samples/fr-meeting.wav \
  --language=fr-FR \
  --channels=2 \
  --diarize=true \
  --sampleRate=44100 \
  --encoding=FLAC
```

Paramètres utiles :

- `--language` : code langue BCP-47 (`fr-FR`, `en-US`, etc.).
- `--channels` : nombre de canaux audio.
- `--sampleRate` : fréquence d'échantillonnage (`sampleRateHertz`).
- `--encoding` : format supporté par l'API (`LINEAR16`, `FLAC`, `OGG_OPUS`, ...).
- `--diarize` : active `enableSpeakerDiarization`.

## Fonctionnement interne

1. Lecture du fichier audio puis encodage en base64.
2. Génération d'un JWT signé (scope `https://www.googleapis.com/auth/cloud-platform`).
3. Échange du JWT contre un access token (`https://oauth2.googleapis.com/token`).
4. Appel de `https://speech.googleapis.com/v1/speech:recognize` avec le payload configuré.

Le moteur concatène toutes les alternatives retenues pour retourner un texte unique.

## Notes

- Assurez-vous que l'horloge du système est synchronisée : les JWT expirent après 1 heure.
- Les fichiers de credentials ne doivent pas être commités. Placez-les hors du dépôt ou ajoutez-les à `.gitignore`.
