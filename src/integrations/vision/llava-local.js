import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour LLaVA.');
  }
  return prompt;
}

export const llavaLocalEngine = {
  id: 'llava',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data } = await loadImageAsBase64(imagePath);
    const serverUrl = requireEnv('LLAVA_SERVER_URL');
    const authToken = process.env.LLAVA_AUTH_TOKEN;

    const response = await fetchWithRetry(
      serverUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: preparedPrompt,
          image: data,
        }),
        timeout: 30000,
      },
      {
        retries: 1,
        retryDelayMs: 1000,
      }
    );

    const payload = await parseJson(response);
    const text = payload?.text?.trim?.();

    if (!text) {
      throw new Error('La réponse LLaVA ne contient pas de texte.');
    }

    return {
      text,
      raw: payload,
    };
  },
};

export const llavaVisionEngine = llavaLocalEngine;

export default llavaLocalEngine;
