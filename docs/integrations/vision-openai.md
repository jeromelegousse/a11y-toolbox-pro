# Intégration OpenAI GPT-4o (vision)

Cette intégration envoie des requêtes au modèle `gpt-4o-mini` via le nouvel endpoint `responses` d'OpenAI. Elle réutilise le socle `fetchWithRetry`, la gestion des variables d'environnement et l'utilitaire `loadImageAsBase64` pour préparer l'image en base64.

## Prérequis

- Node.js 18+
- Clé `OPENAI_API_KEY` disponible dans `.env.local` ou `.env`
- Image PNG/JPEG/WebP (la taille maximale dépend du quota de votre compte)

## Commande de démonstration

```bash
npm run demo:vlm -- --engine=openai-gpt4o --image=./capture.png --prompt="Décrire la scène"
```

## Limitations actuelles

- Quotas : l'API OpenAI applique une facturation à la requête et par token généré. Les limites de débit varient selon le compte et peuvent interrompre la CLI en cas de dépassement.
- Formats d'image : seuls les formats usuels (PNG, JPEG, WebP, GIF, HEIC) sont supportés. Les autres extensions sont envoyées en `application/octet-stream` et peuvent être rejetées par l'API.
- Taille des fichiers : les appels sont optimisés pour des images ≤ 20 Mo. Au-delà, l'encodage base64 peut provoquer un dépassement mémoire.

## Prochaines étapes possibles

- Support des paramètres avancés (`temperature`, `max_output_tokens`).
- Implémentation du streaming de sortie pour les descriptions longues.
- Gestion automatique de la mise à l'échelle des images avant envoi.
