# Intégrations locales (Speech-to-Text & Vision-Language)

Ce dossier regroupe les scripts d'intégration destinés à exécuter des moteurs
**en local**, sans dépendre d'une API distante. Chaque script expose une CLI
compatible avec le contrat attendu par les adaptateurs Node et sérialise un
objet JSON sur la sortie standard.

## Scripts disponibles

### Speech-to-Text

- `whisper_local.py` — Lance [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper).
- `vosk-transcribe.js` — Utilise le module npm [`vosk`](https://github.com/alphacep/vosk-api).
- `parakeet.py` — S'appuie sur [`nemo_toolkit[asr]`](https://github.com/NVIDIA/NeMo) et le modèle Parakeet.

### Vision-Language (VLM)

- `llava_local.py` — Charge un modèle [`LLaVA`](https://llava-vl.github.io/) via
  `transformers` (`AutoProcessor` / `AutoModelForVision2Seq`) pour générer une
  description textuelle d'une image locale.

  ```bash
  # Exemple d'exécution (utilise llava-hf/llava-phi-3-mini par défaut)
  python scripts/integrations/llava_local.py \
    --image ./assets/demo-image.jpg \
    --prompt "Décris la scène"
  ```

## Prérequis d'installation

```bash
# faster-whisper (Python >= 3.8)
pip install --upgrade pip
pip install faster-whisper

# Vosk (Node >= 18)
npm install vosk

# NVIDIA NeMo Parakeet (Python >= 3.10 recommandé)
pip install nemo_toolkit[asr]
# Suivez la documentation NVIDIA pour installer PyTorch + CUDA adaptés à votre GPU.

# LLaVA local (Python >= 3.10 recommandé)
pip install transformers accelerate pillow
```

### Modèles et paramètres supplémentaires

- **faster-whisper**
  - Le modèle utilisé est défini via `FASTER_WHISPER_MODEL` (chemin vers les
    poids) ou `FASTER_WHISPER_MODEL_SIZE` (`tiny`, `base`, `small`, `medium`,
    `large-v3`, etc.).
  - Ajustez `FASTER_WHISPER_DEVICE` (`cpu`, `cuda`, `auto`) et
    `FASTER_WHISPER_COMPUTE_TYPE` (`int8`, `float16`, `default`) selon votre
    matériel.
  - Les variables `FASTER_WHISPER_BEAM_SIZE` et `FASTER_WHISPER_TEMPERATURE`
    permettent de tuner les performances/qualité.

- **Vosk**
  - Téléchargez un modèle adapté à votre langue depuis
    <https://alphacephei.com/vosk/models> et décompressez-le, puis pointez la
    variable `VOSK_MODEL_PATH` vers ce dossier.
  - Les fichiers d'entrée doivent être en WAV PCM 16 bits. Utilisez `ffmpeg`
    pour convertir si nécessaire :
    ```bash
    ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
    ```

- **NVIDIA NeMo Parakeet**
  - Sélectionnez le modèle via `PARAKEET_MODEL_NAME`
    (ex. `stt_en_conformer_ctc_small`).
  - Forcez le périphérique (`cpu`, `cuda`) avec `PARAKEET_DEVICE`.
  - Certains modèles exigent une carte GPU ; les performances CPU sont limitées
    aux courtes durées.

- **LLaVA (Vision-Language Model)**
  - Définissez `LLAVA_MODEL_NAME` pour choisir le modèle (`llava-hf/llava-phi-3-mini`
    est utilisé par défaut si aucune valeur n'est fournie et que `--model`
    n'est pas passé en CLI).
  - Forcez le périphérique avec `LLAVA_DEVICE` (`cpu`, `cuda`). Par défaut, le
    script choisit automatiquement `cuda` si disponible.
  - Les poids légers (famille _phi-3-mini_) conviennent aux cartes GPU modestes
    ou à l'exécution CPU, mais restent coûteux.
  - Contrôlez la longueur des réponses avec `LLAVA_MAX_NEW_TOKENS` (512 par défaut).
  - Activez un mode mock déterministe via `A11Y_TOOLBOX_VLM_MOCK_TEXT` pour
    contourner le téléchargement des poids lors des tests.

### Notes sur les performances

- `faster-whisper` exploite `CTranslate2`. Sur CPU, privilégiez les modèles
  `base` ou `small`. Sur GPU, utilisez `FASTER_WHISPER_COMPUTE_TYPE=float16`.
- `vosk` fonctionne entièrement sur CPU mais nécessite un modèle adapté à la
  langue. Les fichiers longs augmentent la latence proportionnellement.
- `parakeet` est optimisé pour GPU (CUDA). En mode CPU, prévoyez plusieurs
  minutes par minute d'audio selon le modèle.
- `llava_local.py` requiert beaucoup de mémoire GPU/CPU et peut prendre
  plusieurs secondes par requête selon la taille du modèle.

## Mode mock pour les tests

Les tests d'intégration activent `A11Y_TOOLBOX_STT_MOCK_TEXT` afin de bypasser
les dépendances lourdes et produire une sortie déterministe. Définissez la même
variable dans votre environnement pour vérifier rapidement l'intégration sans
télécharger les modèles.

Pour le script VLM, définissez `A11Y_TOOLBOX_VLM_MOCK_TEXT` pour court-circuiter
l'inférence et retourner la chaîne fournie. Utile pour les tests automatisés
sans télécharger les poids LLaVA.
