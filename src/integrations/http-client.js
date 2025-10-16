const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Effectue un appel fetch avec gestion du timeout et des retries.
 * @param {string | URL} url
 * @param {RequestInit & { timeout?: number, body?: RequestInit['body'] | (() => RequestInit['body']) }} [options]
 * @param {{ retries?: number, retryDelayMs?: number }} [retryOptions]
 */
export async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, signal, body, ...restOptions } = options;

  const { retries = DEFAULT_RETRIES, retryDelayMs = 750 } = retryOptions;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    attempt += 1;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...restOptions,
        body: typeof body === 'function' ? body() : body,
        signal: signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Requête HTTP échouée (${response.status} ${response.statusText})`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt > retries) {
        break;
      }
      await delay(retryDelayMs * attempt);
    }
  }

  throw lastError ?? new Error('Échec de la requête HTTP');
}

/**
 * Adapte les réponses JSON pour unifier les clients.
 * @param {Response} response
 */
export async function parseJson(response) {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('La réponse ne contient pas de JSON');
  }
  return response.json();
}

/**
 * Interface contractuelle pour les moteurs de transcription.
 * @typedef {Object} SpeechEngine
 * @property {string} id Identifiant unique de l'intégration.
 * @property {(input: { filePath: string, language?: string }) => Promise<{ text: string, raw?: unknown }>} transcribe
 */

/**
 * Interface contractuelle pour les moteurs vision-language.
 * @typedef {Object} VisionEngine
 * @property {string} id Identifiant unique de l'intégration.
 * @property {(input: { imagePath: string, prompt: string }) => Promise<{ text: string, raw?: unknown }>} analyze
 */
