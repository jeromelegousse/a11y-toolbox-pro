# Intégration LLaVA locale (vision)

L'intégration `llava-local` s'appuie sur un script Python pour exécuter un modèle LLaVA via la bibliothèque `transformers`. Le bridge Node charge le script (déclaré via `LLAVA_SCRIPT_PATH`) et lui transmet l'image ainsi que le prompt texte afin de récupérer une description de scène exploitable dans les modules front.

## Prérequis

| Composant                     | Détails                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Python**                    | Version 3.10 ou supérieure avec `pip`. Un environnement virtuel est recommandé (`python -m venv .venv && source .venv/bin/activate`).                                                                           |
| **Dépendances**               | Installer PyTorch avant `transformers` :<br>`pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121`<br>`pip install transformers accelerate safetensors pillow` |
| **Modèle recommandé**         | `liuhaotian/llava-v1.5-7b-hf` pour l'équilibre précision ↔ performance. Télécharger en amont via `huggingface-cli download`.                                                                                   |
| **Variables d'environnement** | `LLAVA_SCRIPT_PATH` et `LLAVA_MODEL_NAME` doivent être définies (voir section dédiée).                                                                                                                          |

## Commande de démonstration

Exécuter la CLI de démonstration depuis la racine du projet :

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

| Variable            | Description                                                  | Exemple                                  |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `LLAVA_SCRIPT_PATH` | Chemin absolu vers le script Python déclenchant l'inférence. | `/home/user/a11y/scripts/llava_infer.py` |
| `LLAVA_MODEL_NAME`  | Nom du modèle Hugging Face chargé par le script.             | `liuhaotian/llava-v1.5-7b-hf`            |

> Astuce : ajouter ces variables dans `.env.local` afin que `loadEnvironment()` les charge automatiquement pour les scripts Node.

## Configuration WordPress

- Dans l'onglet **Intégrations vocales & IA** du plugin WordPress, renseignez l'**endpoint LLaVA** (URL HTTPS vers votre proxy ou passerelle).
- Saisissez ensuite le **secret LLaVA** généré côté serveur. La valeur est chiffrée via les salts WordPress avant stockage puis masquée dans l'interface.
- Le tableau de bord indique si le duo endpoint/secret est prêt ou s'il manque une information (ou si le secret doit être régénéré).

## Options du module front

Le module « Assistant visuel » expose les options suivantes dans le panneau global afin de guider les équipes produit et support :

| Option (clé de config)              | Type              | Utilisation côté produit/support                                                                                            |
| ----------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `vision.assistant.engine`           | Liste déroulante  | Choisir le moteur actif (`llava-local`, `openai-gpt4o`, `google-gemini`, `moondream`).                                      |
| `vision.assistant.localFallback`    | Toggle            | Forcer la préférence pour les scripts locaux (`llava-local`) lorsque les clés API distantes sont absentes ou indisponibles. |
| `vision.assistant.promptTemplate`   | Texte multi-ligne | Personnaliser l'instruction envoyée au modèle (ajout de consignes d'accessibilité, tonalité, etc.).                         |
| `vision.assistant.shareToClipboard` | Toggle            | Copier automatiquement la réponse générée dans le presse-papiers pour accélérer l'assistance aux utilisateurs.              |

Chaque changement déclenche `window.a11ytb?.logActivity?.(...)` : les équipes support peuvent ainsi auditer les réglages utilisés au cours d'une session.
