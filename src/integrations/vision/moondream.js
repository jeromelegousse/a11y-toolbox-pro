import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';

const MOONDREAM_ENDPOINT = 'https://api.moondream.ai/v1/chat/completions';
const DEFAULT_MODEL = 'moondream-1';

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour Moondream.');
  }
  return prompt;
}

function extractText(payload) {
  return payload?.choices?.[0]?.message?.content ?? payload?.output;
}

export const moondreamVisionEngine = {
  id: 'moondream',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data, mimeType } = await loadImageAsBase64(imagePath);
    const apiKey = requireEnv('MOONDREAM_API_KEY');

    const response = await fetchWithRetry(
      MOONDREAM_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            {
              role: 'user',
              content: preparedPrompt,
            },
          ],
          image: {
            mime_type: mimeType,
            data,
          },
        }),
        timeout: 30000,
      },
      {
        retries: 1,
        retryDelayMs: 1000,
      }
    );

    const payload = await parseJson(response);
    const text = extractText(payload)?.trim();

    if (!text) {
      throw new Error('La réponse Moondream ne contient pas de texte.');
    }

    return {
      text,
      raw: payload,
    };
  },
};

export default moondreamVisionEngine;
