# Intégration Azure Speech Services

Cette intégration adresse l'API REST de Microsoft Azure pour convertir l'audio en texte. Elle supporte la définition de la langue, des canaux et de la diarisation directement depuis la CLI de démonstration.

## Prérequis

- Node.js 18+
- Variables `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` définies dans `.env.local`
- Ressource Cognitive Services (Speech) provisionnée sur Azure
- Fichier audio WAV/MP3 (mono ou stéréo)

## Commande de démonstration

```bash
npm run demo:stt -- \
  --engine=azure-speech \
  --file=./data/samples/fr-callcenter.wav \
  --language=fr-FR \
  --diarize=true \
  --channels=1
```

Options spécifiques :

- `--region` : remplace la région définie dans `AZURE_SPEECH_REGION` (utile pour tester plusieurs ressources).
- `--diarize` : ajoute `diarizationEnabled=true` pour activer la séparation des voix.
- `--channels` : transmet `audioChannelCount` à l'API.

## Fonctionnement interne

- `src/integrations/stt/azure-speech.js` construit l'URL `https://{region}.stt.speech.microsoft.com/...` et envoie le flux audio brut.
- La réponse est analysée via `parseJson` pour extraire `DisplayText` ou la meilleure alternative (`NBest[0].Display`).
- Les erreurs réseau sont gérées avec `fetchWithRetry` (timeout 45s).

## Notes

- Azure impose que la région du endpoint corresponde à la ressource Speech associée.
- Les fonctionnalités avancées (mode conversationnel, personnalisation de vocabulaire) pourront être ajoutées dans un second temps.
