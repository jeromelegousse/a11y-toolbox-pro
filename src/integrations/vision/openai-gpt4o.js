import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4o-mini';

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour l\'analyse d\'image.');
  }
  return prompt;
}

function pickFirstText(payload) {
  if (!payload) {
    return undefined;
  }

  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const outputText = payload.output?.flatMap((item) => item?.content ?? [])
    .map((part) => part?.text)
    .find((value) => Boolean(value));
  if (outputText) {
    return outputText;
  }

  return payload.choices?.[0]?.message?.content;
}

export const openAiGpt4oEngine = {
  id: 'openai-gpt4o',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data, mimeType } = await loadImageAsBase64(imagePath);
    const apiKey = requireEnv('OPENAI_API_KEY');

    const response = await fetchWithRetry(
      OPENAI_RESPONSES_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: preparedPrompt },
                { type: 'input_image', mime_type: mimeType, image_base64: data }
              ]
            }
          ]
        }),
        timeout: 30000
      },
      {
        retries: 1,
        retryDelayMs: 1000
      }
    );

    const payload = await parseJson(response);
    const text = pickFirstText(payload)?.trim();

    if (!text) {
      throw new Error('La réponse OpenAI ne contient pas de texte.');
    }

    return {
      text,
      raw: payload
    };
  }
};

export default openAiGpt4oEngine;
