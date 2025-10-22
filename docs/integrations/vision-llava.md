# Intégration LLaVA locale (vision)

L'intégration `llava-local` s'appuie sur un script Python pour exécuter un modèle LLaVA via la bibliothèque `transformers`. Le bridge Node charge le script (déclaré via `LLAVA_SCRIPT_PATH`) et lui transmet l'image ainsi que le prompt texte afin de récupérer une description de scène exploitable dans les modules front.

## Prérequis

- Python 3.10+ avec `pip`
- Environnement virtuel recommandé (`python -m venv .venv` puis `source .venv/bin/activate`)
- Installation des dépendances :
  ```bash
  pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  pip install transformers accelerate safetensors pillow
  ```
- Accès au modèle Hugging Face `liuhaotian/llava-v1.5-7b-hf` (recommandé pour l'équilibre précision/performance)
- Variables d'environnement `LLAVA_SCRIPT_PATH` et `LLAVA_MODEL_NAME` renseignées (voir plus bas)

## Commande de démonstration

```bash
npm run demo:vlm -- --engine=llava-local --image=./capture.png --prompt="Décrire la scène"
```

La CLI charge automatiquement `LLAVA_SCRIPT_PATH`. Par défaut, le script consomme `LLAVA_MODEL_NAME` pour choisir le modèle (ex. `liuhaotian/llava-v1.5-7b-hf`). Les sorties sont normalisées pour renvoyer un champ `text` cohérent avec les autres moteurs (`openai-gpt4o`, `google-gemini`, `moondream`).

## Limitations actuelles

- **Poids du modèle** : la version 7B pèse ~13 Go en 16 bits. Prévoir ~26 Go d'espace disque libre (cache + fichiers temporaires). Une variante quantifiée (4 bits) réduit la taille mais augmente le temps d'initialisation.
- **Temps de chargement** : compter 45 à 90 secondes sur CPU avant la première réponse. Sur GPU (>= 12 Go VRAM), l'initialisation descend à 10-15 secondes.
- **Ressources GPU/CPU** :
  - GPU conseillé : NVIDIA RTX 3060 (12 Go VRAM) ou supérieur pour des latences < 6 s.
  - CPU de secours : 8 cœurs (ou plus) et 32 Go de RAM pour rester sous 25 s par requête.
- **Compatibilité** : `transformers` requiert `torch` compilé avec CUDA 12.1 pour l'accélération GPU. Sur CPU pur, supprimer la roue CUDA et installer `pip install torch==2.2.*` pour la version `cpu`.

## Variables d'environnement

- `LLAVA_SCRIPT_PATH` : chemin absolu vers le script Python déclenchant l'inférence (ex. `~/workspace/a11y/scripts/llava_infer.py`).
- `LLAVA_MODEL_NAME` : nom du modèle Hugging Face chargé par le script (par défaut `liuhaotian/llava-v1.5-7b-hf`).

> Astuce : ajouter ces variables dans `.env.local` afin que `loadEnvironment()` les charge automatiquement pour les scripts Node.

## Options du module front

Le module « Assistant visuel » exposera les options suivantes dans le panneau global pour faciliter le support produit :

- **Sélection du moteur** (`config.fields[].path = 'vision.assistant.engine'`) : liste déroulante permettant d'alterner entre `llava-local`, `openai-gpt4o`, `google-gemini` et `moondream`.
- **Mode exécution locale** (`'vision.assistant.localFallback'`) : toggle activant la préférence pour les scripts locaux (`llava-local`) lorsque les clés API sont absentes.
- **Gabarit de prompt** (`'vision.assistant.promptTemplate'`) : champ texte multi-ligne pour personnaliser l'instruction envoyée au modèle (ex. ajouter des consignes d'accessibilité).
- **Partage de descriptions** (`'vision.assistant.shareToClipboard'`) : toggle qui copie automatiquement la réponse dans le presse-papiers pour accélérer l'assistance utilisateur.

Chaque modification déclenchera un événement `window.a11ytb?.logActivity?.(...)` afin que les équipes support puissent auditer les réglages utilisés lors d'une session.
