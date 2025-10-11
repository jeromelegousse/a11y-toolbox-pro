# Plan d'intégration rapide STT & Vision-Language

Ce plan couvre l'intégration rapide des moteurs de reconnaissance vocale et des modèles vision-language disposant d'un **quota gratuit** ou d'un déploiement local simple (sans Docker).

## 1. Préparation

1. **Gestion des secrets**
   - Ajouter un fichier `.env.local` à la racine du projet (déjà ignoré par Git si nécessaire).
   - Renseigner les clés sous la forme `FOURNISSEUR_API_KEY="..."`.
   - Documenter les procédures de récupération des clés dans `docs/credentials/README.md` (à créer si besoin).
   - Prévoir un utilitaire Node/TS pour charger ces variables via `dotenv`.

2. **Outils communs**
   - Créer un service `packages/integrations/src/api-clients.ts` centralisant les appels HTTP (`fetch` natif + gestion retries/timeout).
   - Structurer une interface `SpeechEngine` et `VisionEngine` pour uniformiser les appels.
   - Mettre en place un dossier `data/samples/` contenant une dizaine de fichiers audio courts + captures pour tests rapides.

## 2. Vague 1 — APIs avec quota gratuit

| Fournisseur | Avantages | Quota gratuit | Actions immédiates |
|-------------|-----------|---------------|--------------------|
| **OpenAI Whisper API** | Haute précision multilingue | Crédit d'essai (5$) | Créer un client `openai-whisper.ts`, tester transcription `whisper-1`.
| **Google Cloud Speech-to-Text v2** | Streaming + diarisation | 60 min/mois (90 jours) | Utiliser compte d'essai, configurer `GOOGLE_APPLICATION_CREDENTIALS` et wrapper REST (`speech:recognize`).
| **Deepgram** | Bons SDK + webhooks | 200$ crédit d'accueil | Utiliser SDK JS officiel, test sur échantillon `pre-recorded`.
| **AssemblyAI** | Fonctionnalités enrichies (résumé) | 3h gratuites | Appel REST `/v2/transcript`, suivre statut asynchrone.
| **Azure Speech** | Multiplateforme, adaptation vocabulaire | 5h gratuites | SDK JS `@azure/cognitiveservices-speech-sdk`, implémenter transcription simple.

**Étapes d'intégration**
1. Implémenter les clients un par un en respectant l'interface `SpeechEngine`.
2. Ajouter un `script npm` (`npm run demo:stt -- --engine=openai --file=...`).
3. Stocker les résultats JSON dans `reports/stt/YYYYMMDD/` pour comparaison rapide.

## 3. Vague 2 — Solutions locales sans Docker

| Modèle | Méthode | Étapes |
|--------|---------|--------|
| **faster-whisper** | Python + bindings CTranslate2 | Ajouter script `python scripts/whisper_local.py --model=medium --input=...`.
| **Vosk** | Packages Python précompilés | Script Node `vosk-transcribe.ts` via `vosk` npm (fonctionne CPU).
| **NVIDIA NeMo Parakeet** | Installation pip (`nemo_toolkit[asr]`) | Lancer notebook/CLI `python scripts/parakeet.py`. GPU recommandé mais fonctionne en CPU pour petits tests.

Prévoir un README dédié dans `scripts/` expliquant l'installation (requirements, commandes).

## 4. Modèles Vision-Language (VLM)

### APIs avec quota gratuit
- **OpenAI GPT-4o mini** : crédit d'essai, endpoint `responses`. Implémenter client `vision/openai-gpt4o.ts`.
- **Google Gemini 1.5 Flash** : 15 requêtes/minute gratuites avec clé API, endpoint `gemini-pro-vision`. Créer client `vision/google-gemini.ts`.
- **Anthropic Claude 3.5 Haiku (via API gratuite limitée)** : tester si quota disponible, fallback sur plan payant.

### Modèles locaux faciles
- **Moondream** : dispo sur Hugging Face, poids < 1.8 Go. Installer via `pip install moondream`. Script `python scripts/moondream_qa.py`.
- **LLaVA 1.5 HF Inference** : utiliser `transformers` + `AutoProcessor`.

## 5. Priorités de développement

1. **Semaine 1**
   - Mettre en place la base (`.env.local`, service API, interfaces).
   - Implémenter OpenAI Whisper API + script de démo.
   - Préparer dataset échantillon.

2. **Semaine 2**
   - Ajouter Deepgram + AssemblyAI (scripts de tests + reporting).
   - Démarrer Google Cloud Speech (authentification service account).

3. **Semaine 3**
   - Intégrer Azure Speech.
   - Déployer `faster-whisper` local + comparatif initial.

4. **Semaine 4**
   - Étendre aux VLM (OpenAI / Gemini).
   - Prototype Moondream local.

5. **Semaine 5**
   - Rassembler métriques (latence, coût, précision) dans un tableau comparatif.
   - Identifier 2 moteurs STT + 1 VLM pour mise en production.

## 6. Suivi et automatisation

- Ajouter workflows `npm run benchmark:stt` et `npm run benchmark:vlm` (cible ultérieure).
- Utiliser `Vitest` pour assertions de base (ex. latence < seuil sur échantillon).
- Documenter chaque intégration dans `docs/integrations/<provider>.md`.

Ce plan peut être ajusté après le retour d'expérience de la première vague d'intégrations.
