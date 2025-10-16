import { createReadStream } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';

const OPENAI_TRANSCRIPTION_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';

function ensureFilePath(filePath) {
  if (!filePath) {
    throw new Error('Le paramètre "filePath" est obligatoire pour la transcription.');
  }
  return resolve(filePath);
}

export const openAiWhisperEngine = {
  id: 'openai-whisper',
  async transcribe({ filePath, language, model } = {}) {
    const absolutePath = ensureFilePath(filePath);
    const apiKey = requireEnv('OPENAI_API_KEY');

    const createPayload = () => {
      const formData = new FormData();
      formData.append('model', model ?? DEFAULT_MODEL);
      formData.append('file', createReadStream(absolutePath), basename(absolutePath));

      if (language) {
        formData.append('language', language);
      }

      return formData;
    };

    const response = await fetchWithRetry(
      OPENAI_TRANSCRIPTION_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: createPayload,
        timeout: 30000
      },
      {
        retries: 1,
        retryDelayMs: 1000
      }
    );

    const payload = await parseJson(response);

    if (!payload?.text) {
      throw new Error('La réponse OpenAI ne contient pas de transcription.');
    }

    return {
      text: payload.text,
      raw: payload
    };
  }
};

export default openAiWhisperEngine;
