import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';

const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_FORMAT = 'detailed';
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

export const azureSpeechEngine = {
  id: 'azure-speech',
  /**
   * @param {{ filePath: string, language?: string, channels?: number, diarize?: boolean, region?: string }} options
   */
  async transcribe({ filePath, language = DEFAULT_LANGUAGE, channels, diarize, region: regionOverride } = {}) {
    const absolutePath = ensureFilePath(filePath);
    const apiKey = requireEnv('AZURE_SPEECH_KEY');
    const region = regionOverride ?? requireEnv('AZURE_SPEECH_REGION');
    const audioBuffer = await readAudio(absolutePath);

    const url = new URL(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`);
    url.searchParams.set('language', language);
    url.searchParams.set('format', DEFAULT_FORMAT);
    if (typeof channels === 'number') {
      url.searchParams.set('audioChannelCount', String(channels));
    }
    if (typeof diarize === 'boolean' && diarize) {
      url.searchParams.set('diarizationEnabled', 'true');
    }

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': DEFAULT_MIME_TYPE
        },
        body: audioBuffer,
        timeout: 45000
      },
      {
        retries: 1,
        retryDelayMs: 1000
      }
    );

    const payload = await parseJson(response);
    const transcript = payload?.DisplayText || payload?.NBest?.[0]?.Display;

    if (!transcript) {
      throw new Error('La réponse Azure Speech Services ne contient pas de transcription.');
    }

    return {
      text: transcript,
      raw: payload
    };
  }
};

export default azureSpeechEngine;
