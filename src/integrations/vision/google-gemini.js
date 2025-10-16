import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent';

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour la génération Gemini.');
  }
  return prompt;
}

function extractText(payload) {
  const candidates = payload?.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts ?? [];
    const textParts = parts.map((part) => part?.text).filter(Boolean);
    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }
  return undefined;
}

export const googleGeminiVisionEngine = {
  id: 'google-gemini',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data, mimeType } = await loadImageAsBase64(imagePath);
    const apiKey = requireEnv('GEMINI_API_KEY');

    const response = await fetchWithRetry(
      `${GEMINI_ENDPOINT}?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: preparedPrompt }, { inlineData: { mimeType, data } }],
            },
          ],
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
      throw new Error('La réponse Gemini ne contient pas de texte.');
    }

    return {
      text,
      raw: payload,
    };
  },
};

export default googleGeminiVisionEngine;
