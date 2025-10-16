# Intégration Moondream (vision)

Le moteur `moondream` cible l'API `chat/completions` proposée par Moondream pour l'analyse d'images. L'image est encodée via `loadImageAsBase64` puis transmise dans le champ `image` du payload JSON aux côtés du `prompt` texte.

## Prérequis

- Node.js 18+
- Clé `MOONDREAM_API_KEY` renseignée dans `.env.local`
- Image PNG/JPEG (les autres formats sont envoyés en `application/octet-stream`)

## Commande de démonstration

```bash
npm run demo:vlm -- --engine=moondream --image=./capture.png --prompt="Décrire la scène"
```

## Limitations actuelles

- Quotas : l'API est soumise à un quota journalier d'appels et de tokens. Les dépassements renvoient des réponses 429/503 qui seront relayées par `fetchWithRetry` après les tentatives configurées.
- Formats : Moondream documente le support de PNG et JPEG. Les GIF/WEBP ne sont pas officiellement pris en charge et peuvent générer des erreurs.
- Taille : pour garantir de bonnes performances, il est recommandé de rester sous 10 Mo par image. L'encodage base64 double pratiquement le volume envoyé.

## Prochaines étapes possibles

- Support d'un champ `system` pour personnaliser la tonalité des réponses.
- Gestion des réponses multimodales (retour d'étiquettes structurées).
- Ajout de la possibilité d'envoyer plusieurs images dans la même requête.
