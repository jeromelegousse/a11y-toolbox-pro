# Gestion des identifiants API

Ce dossier centralise les informations nécessaires pour récupérer et configurer les clés utilisées par les scripts d'intégration STT et VLM.

## Fichier `.env.local`

1. Dupliquer `.env.example` en `.env.local` à la racine du projet.
2. Renseigner les clés selon les fournisseurs activés.
3. Ne **jamais** committer ce fichier ni les secrets associés.

## OpenAI (Whisper API)

1. Créer un compte sur [platform.openai.com](https://platform.openai.com/).
2. Rendez-vous dans **API Keys** et générer une nouvelle clé.
3. Renseigner la variable `OPENAI_API_KEY` dans `.env.local`.
4. Les 5 premiers dollars de crédit sont offerts à l'ouverture du compte et suffisent pour les tests initiaux.

## Google Cloud Speech-to-Text

1. Créer un projet GCP et activer l'API Speech-to-Text v2.
2. Générer une clé de compte de service avec le rôle `Cloud Speech Administrator`.
3. Télécharger le JSON et le stocker hors dépôt (ex: `credentials/google-service-account.json`).
4. Renseigner `GOOGLE_APPLICATION_CREDENTIALS` vers ce fichier dans `.env.local`.

## Deepgram

1. Créer un compte sur [deepgram.com](https://deepgram.com/).
2. Dans le dashboard, créer une clé API de type **Secret**.
3. Ajouter la valeur dans `DEEPGRAM_API_KEY`.
4. Un crédit d'essai de 200$ est généralement offert pour les POC.

## AssemblyAI

1. Créer un compte sur [assemblyai.com](https://www.assemblyai.com/).
2. Copier la clé depuis la section **Dashboard > API Keys**.
3. Renseigner `ASSEMBLYAI_API_KEY`.
4. 3 heures de transcription gratuites sont proposées aux nouveaux comptes.

## Azure Speech Service

1. Créer une ressource **Speech** dans Azure Portal (Free Tier possible).
2. Récupérer la clé et la région depuis **Keys and Endpoint**.
3. Renseigner `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION`.

## Vision-Language

- `OPENAI_VISION_MODEL_KEY` : même procédure que pour Whisper (utiliser la même clé si souhaité).
- `GEMINI_API_KEY` : clé API via [Google AI Studio](https://aistudio.google.com/).
- `ANTHROPIC_API_KEY` : clé générée depuis [Anthropic Console](https://console.anthropic.com/).

> ✅ Mettre à jour ce document au fur et à mesure de l'ajout de nouveaux fournisseurs.
