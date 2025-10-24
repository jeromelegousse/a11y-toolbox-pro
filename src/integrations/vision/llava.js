import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithRetry, parseJson } from '../http-client.js';
import { requireEnv } from '../../../scripts/integrations/env.js';
import { loadImageAsBase64 } from './utils.js';
import { getLlavaRemoteConfig } from './remote-config.js';

const PYTHON_EXECUTABLE = process.env.A11Y_TOOLBOX_VLM_PYTHON || 'python3';
const DEFAULT_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/integrations/llava_local.py'
);
const DEFAULT_REMOTE_MODEL = 'llava-hf/llava-phi-3-mini';
const DEFAULT_REMOTE_TIMEOUT = 45000;

const SCRIPT_EXIT_CODE_MAP = new Map([
  [10, { type: 'IMAGE_NOT_FOUND', status: 404 }],
  [11, { type: 'INVALID_ARGUMENT', status: 400 }],
  [12, { type: 'MODEL_NOT_FOUND', status: 422 }],
  [13, { type: 'DEPENDENCY_MISSING', status: 501 }],
  [14, { type: 'GPU_UNAVAILABLE', status: 503 }],
  [15, { type: 'INFERENCE_ERROR', status: 500 }],
  [16, { type: 'IMAGE_DECODE_ERROR', status: 422 }],
]);

const TIMEOUT_ERROR_META = { type: 'LLAVA_TIMEOUT', status: 504 };

function toErrorDetail(value) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (typeof value.toString === 'function') {
    return value.toString().trim() || undefined;
  }

  return undefined;
}

function buildRestError({ type, status, message, exitCode, detail }) {
  const error = new Error(message);
  error.name = 'LlavaLocalError';
  error.status = status;
  error.exitCode = exitCode ?? null;
  error.detail = detail;
  error.errorType = type;
  error.rest = {
    status,
    body: {
      ok: false,
      error: {
        type,
        message,
        ...(exitCode !== undefined ? { exitCode } : {}),
        ...(detail ? { detail } : {}),
      },
    },
  };

  return error;
}

function normalizeScriptFailure(error, stderr) {
  const detail = toErrorDetail(stderr) || toErrorDetail(error?.stderr);

  if (error?.killed || error?.signal === 'SIGTERM' || error?.signal === 'SIGKILL') {
    const message = detail || "Le script LLaVA s'est interrompu avant de répondre (timeout).";
    return buildRestError({
      ...TIMEOUT_ERROR_META,
      message,
      detail,
    });
  }

  const exitCode = Number.isInteger(error?.code)
    ? Number(error.code)
    : Number.isInteger(Number.parseInt(error?.code, 10))
    ? Number.parseInt(error.code, 10)
    : undefined;

  if (Number.isInteger(exitCode)) {
    const meta = SCRIPT_EXIT_CODE_MAP.get(exitCode) || {
      type: 'LLAVA_SCRIPT_ERROR',
      status: 500,
    };

    const message = detail || `Échec de l'exécution du script LLaVA (${meta.type}).`;
    return buildRestError({
      ...meta,
      message,
      exitCode,
      detail,
    });
  }

  if (typeof error?.code === 'string') {
    const message = detail || `Impossible de lancer le script LLaVA (${error.code}).`;
    return buildRestError({
      type: 'LLAVA_EXECUTION_FAILED',
      status: 500,
      message,
      detail,
    });
  }

  const fallbackMessage = detail || error?.message || "Échec de l'exécution du script LLaVA.";
  return buildRestError({
    type: 'LLAVA_SCRIPT_ERROR',
    status: 500,
    message: fallbackMessage,
    detail,
  });
}

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour LLaVA.');
  }
  return prompt;
}

function ensureScriptPath() {
  const scriptPath = process.env.LLAVA_SCRIPT_PATH?.trim() || DEFAULT_SCRIPT_PATH;
  return scriptPath;
}

function resolveRemoteEndpoint() {
  const modelName = process.env.LLAVA_REMOTE_MODEL?.trim() || DEFAULT_REMOTE_MODEL;
  return `https://api-inference.huggingface.co/models/${modelName}`;
}

async function runLlavaScript({ scriptPath, imagePath, prompt, env }) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      PYTHON_EXECUTABLE,
      [scriptPath, '--image', imagePath, '--prompt', prompt],
      {
        env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(normalizeScriptFailure(error, stderr));
          return;
        }
        resolve(stdout);
      }
    );

    child.on('error', (spawnError) => {
      reject(normalizeScriptFailure(spawnError));
    });
  });
}

function parsePayload(output) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (error) {
    throw new Error("La sortie du script LLaVA n'est pas un JSON valide.");
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';

  if (!text) {
    throw new Error('La réponse LLaVA ne contient pas de texte.');
  }

  return {
    text,
    raw: payload.raw ?? payload,
  };
}

function pickGeneratedText(payload) {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const text = pickGeneratedText(item);
      if (text) {
        return text;
      }
    }
    return undefined;
  }

  if (typeof payload === 'object') {
    if (typeof payload.generated_text === 'string') {
      return payload.generated_text;
    }

    if (Array.isArray(payload.output)) {
      const text = pickGeneratedText(payload.output);
      if (text) {
        return text;
      }
    }

    if (Array.isArray(payload.outputs)) {
      const text = pickGeneratedText(payload.outputs);
      if (text) {
        return text;
      }
    }

    if (Array.isArray(payload.data)) {
      const text = pickGeneratedText(payload.data);
      if (text) {
        return text;
      }
    }

    if (Array.isArray(payload.conversation)) {
      const text = pickGeneratedText(payload.conversation);
      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

export const llavaRemoteVisionEngine = {
  id: 'llava',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data, mimeType } = await loadImageAsBase64(imagePath);
    let endpoint = resolveRemoteEndpoint();
    let apiToken;

    const remoteConfig = await getLlavaRemoteConfig().catch((error) => {
      throw new Error(`Configuration LLaVA distante invalide : ${error.message}`);
    });

    if (remoteConfig?.endpoint && remoteConfig?.token) {
      endpoint = remoteConfig.endpoint;
      apiToken = remoteConfig.token;
    } else {
      apiToken = requireEnv('HUGGINGFACE_API_TOKEN');
    }

    const response = await fetchWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          inputs: {
            prompt: preparedPrompt,
            image: `data:${mimeType};base64,${data}`,
          },
          parameters: {
            max_new_tokens: 512,
          },
          options: {
            wait_for_model: true,
          },
        }),
        timeout: DEFAULT_REMOTE_TIMEOUT,
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

export const llavaLocalVisionEngine = {
  id: 'llava-local',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const scriptPath = ensureScriptPath();
    const imageData = await loadImageAsBase64(imagePath);

    const stdout = await runLlavaScript({
      scriptPath,
      imagePath: imageData.absolutePath,
      prompt: preparedPrompt,
      env: {
        ...process.env,
        LLAVA_IMAGE_BASE64: imageData.data,
        LLAVA_IMAGE_MIME_TYPE: imageData.mimeType,
      },
    });

    return parsePayload(stdout);
  },
};

export const llavaVisionEngine = {
  id: llavaRemoteVisionEngine.id,
  analyze: (...args) => llavaRemoteVisionEngine.analyze(...args),
  remote: llavaRemoteVisionEngine,
  remoteAnalyze: (...args) => llavaRemoteVisionEngine.analyze(...args),
  local: llavaLocalVisionEngine,
  localAnalyze: (...args) => llavaLocalVisionEngine.analyze(...args),
};

export default llavaVisionEngine;
