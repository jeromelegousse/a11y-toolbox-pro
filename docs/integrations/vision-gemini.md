# Intégration Google Gemini (vision)

L'intégration `google-gemini` s'appuie sur l'API Generative Language (`gemini-pro-vision:generateContent`). Elle envoie la consigne utilisateur et une image encodée en base64 grâce à `loadImageAsBase64`, puis reconstruit la réponse textuelle à partir des différentes `parts` renvoyées.

## Prérequis

- Node.js 18+
- Clé `GEMINI_API_KEY` configurée dans votre fichier `.env`
- Image PNG/JPEG/WebP ; les autres formats doivent être convertis en amont

## Commande de démonstration

```bash
npm run demo:vlm -- --engine=google-gemini --image=./capture.png --prompt="Décrire la scène"
```

## Limitations actuelles

- Quotas : les projets Google Cloud disposent d'un quota quotidien de requêtes et de tokens. Les dépassements retournent une erreur HTTP 429 relayée telle quelle par la CLI.
- Formats : l'API accepte uniquement les formats documentés (PNG, JPEG, WEBP). Les GIF animés sont convertis en image statique par Google et peuvent perdre de l'information.
- Poids des fichiers : la taille maximale acceptée est de 20 Mo. Pour les images HD, privilégier une réduction avant l'appel.

## Prochaines étapes possibles

- Exposition des paramètres `safetySettings` et `generationConfig`.
- Support du streaming pour afficher les parties de réponse au fil de l'eau.
- Ajout d'une option pour compresser automatiquement les images trop volumineuses.
