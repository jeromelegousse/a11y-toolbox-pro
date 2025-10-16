# Intégrations Speech-to-Text locales

Ce dossier regroupe les scripts d'intégration destinés à exécuter des moteurs
de reconnaissance vocale **en local**, sans dépendre d'une API distante. Chaque
script expose une CLI compatible avec le contrat `transcribe({ filePath,
language })` :

- `whisper_local.py` — Lance [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper).
- `vosk-transcribe.js` — Utilise le module npm [`vosk`](https://github.com/alphacep/vosk-api).
- `parakeet.py` — S'appuie sur [`nemo_toolkit[asr]`](https://github.com/NVIDIA/NeMo) et le modèle Parakeet.

Tous les scripts retournent un objet JSON sérialisé sur la sortie standard avec
au minimum la propriété `text`.

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

### Notes sur les performances

- `faster-whisper` exploite `CTranslate2`. Sur CPU, privilégiez les modèles
  `base` ou `small`. Sur GPU, utilisez `FASTER_WHISPER_COMPUTE_TYPE=float16`.
- `vosk` fonctionne entièrement sur CPU mais nécessite un modèle adapté à la
  langue. Les fichiers longs augmentent la latence proportionnellement.
- `parakeet` est optimisé pour GPU (CUDA). En mode CPU, prévoyez plusieurs
  minutes par minute d'audio selon le modèle.

## Mode mock pour les tests

Les tests d'intégration activent `A11Y_TOOLBOX_STT_MOCK_TEXT` afin de bypasser
les dépendances lourdes et produire une sortie déterministe. Définissez la même
variable dans votre environnement pour vérifier rapidement l'intégration sans
télécharger les modèles.
