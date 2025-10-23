import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';

const HUGGING_FACE_LLaVA_ENDPOINT =
  'https://api-inference.huggingface.co/models/liuhaotian/llava-phi-3-mini-hf';

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour LLaVA.');
  }
  return prompt;
}

function pickGeneratedText(payload) {
  if (!Array.isArray(payload)) {
    return undefined;
  }

  return payload[0]?.generated_text;
}

export const llavaVisionEngine = {
  id: 'llava',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data } = await loadImageAsBase64(imagePath);
    const apiKey = requireEnv('HUGGINGFACE_API_TOKEN');

    const response = await fetchWithRetry(
      HUGGING_FACE_LLaVA_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          inputs: {
            image: data,
            question: preparedPrompt,
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
    const text = pickGeneratedText(payload)?.trim();

    if (!text) {
      throw new Error('La réponse LLaVA ne contient pas de texte.');
    }

    return {
      text,
      raw: payload,
    };
  },
};

export default llavaVisionEngine;
