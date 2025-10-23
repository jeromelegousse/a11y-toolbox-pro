# Intégration LLaVA locale (vision)

Le moteur `llava` délègue l'inférence à un serveur HTTP local exposant un point d'entrée compatible LLaVA. L'image est encodée en base64 via `loadImageAsBase64`, puis envoyée au service local aux côtés du prompt utilisateur. Le serveur doit renvoyer un JSON contenant un champ `text`.

## Prérequis

- Python 3.10+
- Environnement virtuel recommandé (`python -m venv .venv` puis `source .venv/bin/activate`)
- Installation des dépendances minimales pour lancer le serveur :
  ```bash
  pip install transformers accelerate
  ```
- Modèle LLaVA téléchargé localement (ex. `liuhaotian/llava-v1.5-7b-hf` via `git lfs` ou `huggingface-cli download`)

## Lancement du serveur

1. Cloner le dépôt [liuhaotian/llava](https://github.com/haotian-liu/LLaVA) ou un fork compatible.
2. Charger les poids désirés, puis démarrer l'API REST (exemple) :
   ```bash
   python -m llava.serve.controller --host 0.0.0.0 --port 11435 &
   python -m llava.serve.openai_api_server \
     --controller http://127.0.0.1:11435 \
     --model-path liuhaotian/llava-v1.5-7b-hf \
     --port 8081 \
     --api-key token-test
   ```
3. L'API OpenAI-compatible exposée ci-dessus accepte un JSON `{ "prompt": "…", "image": "…" }` et renvoie `{ "text": "…" }`.

## Variables d'environnement

- `LLAVA_SERVER_URL` : URL complète du serveur HTTP (ex. `http://127.0.0.1:8081/v1/vision`).
- `LLAVA_AUTH_TOKEN` (optionnelle) : jeton transmis dans l'en-tête `Authorization: Bearer <token>`.

Ajouter ces variables à `.env.local` pour qu'elles soient chargées automatiquement par `loadEnvironment()`.

## Commande de démonstration

```bash
npm run demo:vlm -- --engine=llava --image=./capture.png --prompt="Décrire la scène"
```

La sortie inclut l'identifiant du moteur, le prompt, le chemin de l'image et la réponse textuelle renvoyée par le serveur local.

## Limitations actuelles

- Les performances dépendent fortement du matériel disponible (CPU vs GPU, VRAM, RAM).
- Le serveur doit impérativement renvoyer un JSON valide avec un champ `text`, faute de quoi l'intégration lèvera une erreur.
- Aucune gestion de file d'attente n'est fournie : prévoir une orchestration externe pour traiter plusieurs requêtes simultanées.
