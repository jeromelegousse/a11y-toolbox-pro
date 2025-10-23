import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadImageAsBase64 } from './utils.js';

const PYTHON_EXECUTABLE = process.env.A11Y_TOOLBOX_VLM_PYTHON || 'python3';
const DEFAULT_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/integrations/llava_local.py'
);

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
          const message = stderr?.toString()?.trim() || error.message;
          reject(new Error(`Échec de l'exécution du script LLaVA : ${message}`));
          return;
        }
        resolve(stdout);
      }
    );

    child.on('error', (spawnError) => {
      reject(new Error(`Impossible de lancer le script LLaVA : ${spawnError.message}`));
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

export const llavaVisionEngine = {
  id: 'llava',
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

export default llavaVisionEngine;
