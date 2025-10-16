import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';

const ASSEMBLY_UPLOAD_ENDPOINT = 'https://api.assemblyai.com/v2/upload';
const ASSEMBLY_TRANSCRIPT_ENDPOINT = 'https://api.assemblyai.com/v2/transcript';
const DEFAULT_LANGUAGE = 'en_us';
const DEFAULT_MIME_TYPE = 'audio/wav';
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLLS = 20;

function ensureFilePath(filePath) {
  if (!filePath) {
    throw new Error('Le paramètre "filePath" est obligatoire pour la transcription.');
  }
  return resolve(filePath);
}

async function readAudio(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(`Impossible de lire le fichier audio : ${error.message}`);
  }
}

async function delay(ms) {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const assemblyAiEngine = {
  id: 'assemblyai',
  /**
   * @param {{ filePath: string, language?: string, diarize?: boolean, pollIntervalMs?: number, maxPolls?: number }} options
   */
  async transcribe({
    filePath,
    language,
    diarize,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPolls = DEFAULT_MAX_POLLS,
  } = {}) {
    const absolutePath = ensureFilePath(filePath);
    const apiKey = requireEnv('ASSEMBLYAI_API_KEY');
    const audioBuffer = await readAudio(absolutePath);

    const headers = {
      Authorization: apiKey,
      'Content-Type': DEFAULT_MIME_TYPE,
    };

    const uploadResponse = await fetchWithRetry(
      ASSEMBLY_UPLOAD_ENDPOINT,
      {
        method: 'POST',
        headers,
        body: audioBuffer,
        timeout: 60000,
      },
      {
        retries: 1,
        retryDelayMs: 1000,
      }
    );

    const uploadPayload = await parseJson(uploadResponse);
    const uploadUrl = uploadPayload?.upload_url;

    if (!uploadUrl) {
      throw new Error("La réponse AssemblyAI ne contient pas d'URL de téléversement.");
    }

    const transcriptResponse = await fetchWithRetry(
      ASSEMBLY_TRANSCRIPT_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: uploadUrl,
          language_code: language ?? DEFAULT_LANGUAGE,
          speaker_labels: Boolean(diarize),
        }),
        timeout: 15000,
      },
      {
        retries: 1,
        retryDelayMs: 1000,
      }
    );

    const transcriptPayload = await parseJson(transcriptResponse);
    const transcriptId = transcriptPayload?.id;

    if (!transcriptId) {
      throw new Error('La création de transcription AssemblyAI a échoué.');
    }

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const statusResponse = await fetchWithRetry(
        `${ASSEMBLY_TRANSCRIPT_ENDPOINT}/${transcriptId}`,
        {
          method: 'GET',
          headers: {
            Authorization: apiKey,
          },
          timeout: 15000,
        },
        {
          retries: 1,
          retryDelayMs: 1000,
        }
      );

      const statusPayload = await parseJson(statusResponse);
      if (statusPayload?.status === 'completed') {
        if (!statusPayload.text) {
          throw new Error('AssemblyAI a terminé sans renvoyer de texte.');
        }
        return {
          text: statusPayload.text,
          raw: statusPayload,
        };
      }

      if (statusPayload?.status === 'error') {
        throw new Error(
          `AssemblyAI a renvoyé une erreur : ${statusPayload.error || 'statut inconnu'}`
        );
      }

      await delay(pollIntervalMs);
    }

    throw new Error("AssemblyAI n'a pas terminé la transcription dans le temps imparti.");
  },
};

export default assemblyAiEngine;
