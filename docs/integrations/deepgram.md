# Intégration Deepgram Speech-to-Text

Ce connecteur exploite l'API `listen` de Deepgram pour transcrire rapidement des fichiers audio en s'appuyant sur l'infrastructure commune (`fetchWithRetry`, `parseJson`, chargement `.env`). Il expose les options courantes (langue, modèle, nombre de canaux, diarisation) via la CLI de démonstration.

## Prérequis

- Node.js 18+
- Clé `DEEPGRAM_API_KEY` disponible dans `.env.local` ou `.env`
- Fichier audio en WAV/MP3 (mono ou multi-canaux)

## Commande de démonstration

```bash
npm run demo:stt -- \
  --engine=deepgram \
  --file=./data/samples/fr-podcast.wav \
  --language=fr \
  --diarize=true \
  --channels=2
```

Paramètres pris en charge :

- `--language` : code langue Deepgram (ex. `fr`, `en-US`).
- `--model` : modèle à utiliser (`nova-2-general` par défaut).
- `--channels` : nombre de canaux à transmettre à l'API.
- `--diarize` : active/désactive l'identification des locuteurs.

## Fonctionnement interne

- `scripts/integrations/demo-stt.js` ajoute le moteur `deepgram` à la map `ENGINES`.
- `src/integrations/stt/deepgram.js` lit le fichier audio, prépare les paramètres de requête et envoie les données binaires à `https://api.deepgram.com/v1/listen`.
- Les erreurs réseau sont gérées via `fetchWithRetry` et un timeout de 45s.

## Notes

- Les modèles multi-canaux nécessitent des fichiers adaptés (stéréo pour deux locuteurs, par exemple).
- Deepgram renvoie plusieurs alternatives : nous remontons l'hypothèse principale (`alternatives[0]`).
- En cas de réponse vide, une erreur explicite est levée pour faciliter le débogage.
