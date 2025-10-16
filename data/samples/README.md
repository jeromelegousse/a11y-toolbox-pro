# Jeu d'échantillons

Déposez dans ce dossier quelques fichiers audio (10–30 secondes) et des images représentatives pour tester rapidement les intégrations STT et VLM.

## Recommandations
- Utiliser des formats standards (`.wav` mono 16 kHz pour l'audio, `.png`/`.jpg` pour les images).
- Limiter la taille des fichiers à <10 Mo pour faciliter le partage.
- Ajouter un fichier `metadata.json` si vous disposez des transcriptions de référence.

⚠️ Les fichiers placés ici sont ignorés par Git. Conservez un inventaire séparé si nécessaire.

## Utilisation rapide

### Échantillons recommandés par moteur

- **OpenAI Whisper / Deepgram** : courts extraits vocaux (mono ou stéréo) avec ou sans bruit de fond.
- **AssemblyAI** : conversation de 30 secondes pour tester la diarisation.
- **Google Cloud STT** : réunion avec plusieurs canaux (`--channels=2`) et échantillonnage élevé (`--sampleRate=44100`).
- **Azure Speech** : appel centre de contacts avec accents variés pour valider `--diarize`.

Ajoutez éventuellement un fichier `README.txt` décrivant l'origine des données (anonymisées) et les paramètres utilisés.

Une fois vos fichiers déposés, lancez par exemple :

```bash
npm run demo:stt -- --file=./data/samples/mon-audio.wav --language=fr
```

Le script retournera la transcription générée par l'API configurée.
