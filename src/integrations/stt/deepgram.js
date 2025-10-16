import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';

const DEEPGRAM_ENDPOINT = 'https://api.deepgram.com/v1/listen';
const DEFAULT_MODEL = 'nova-2-general';
const DEFAULT_MIME_TYPE = 'audio/wav';

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

export const deepgramEngine = {
  id: 'deepgram',
  /**
   * @param {{ filePath: string, language?: string, model?: string, channels?: number, diarize?: boolean }} options
   */
  async transcribe({ filePath, language, model = DEFAULT_MODEL, channels, diarize } = {}) {
    const absolutePath = ensureFilePath(filePath);
    const apiKey = requireEnv('DEEPGRAM_API_KEY');
    const audioBuffer = await readAudio(absolutePath);

    const url = new URL(DEEPGRAM_ENDPOINT);
    url.searchParams.set('model', model);
    if (language) {
      url.searchParams.set('language', language);
    }
    if (typeof channels === 'number') {
      url.searchParams.set('channels', String(channels));
    }
    if (typeof diarize === 'boolean') {
      url.searchParams.set('diarize', diarize ? 'true' : 'false');
    }

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': DEFAULT_MIME_TYPE
        },
        body: audioBuffer,
        timeout: 45000
      },
      {
        retries: 2,
        retryDelayMs: 1000
      }
    );

    const payload = await parseJson(response);
    const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    if (!transcript) {
      throw new Error('La réponse Deepgram ne contient pas de transcription exploitable.');
    }

    return {
      text: transcript,
      raw: payload
    };
  }
};

export default deepgramEngine;
