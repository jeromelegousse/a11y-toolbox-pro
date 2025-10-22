import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadImageAsBase64 } from './utils.js';

const DEFAULT_SCRIPT_PATH = fileURLToPath(
  new URL('../../../scripts/integrations/llava_local.py', import.meta.url)
);

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour LLaVA.');
  }
  return prompt;
}

function resolveScriptPath() {
  const scriptPath = process.env.LLAVA_SCRIPT_PATH ?? DEFAULT_SCRIPT_PATH;
  return resolve(scriptPath);
}

function runPythonScript(scriptPath, args = [], { input } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('python3', [scriptPath, ...args], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(
          `Le script LLaVA a échoué avec le code ${code}: ${stderr || stdout}`
        );
        error.code = code;
        rejectPromise(error);
        return;
      }

      resolvePromise({ stdout, stderr });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export const llavaVisionEngine = {
  id: 'llava-local',
  async analyze({ imagePath, prompt } = {}) {
    const preparedPrompt = ensurePrompt(prompt);
    const { data, mimeType, absolutePath, filename, size } = await loadImageAsBase64(
      imagePath
    );
    const scriptPath = resolveScriptPath();

    const payload = JSON.stringify({
      prompt: preparedPrompt,
      image: {
        path: absolutePath,
        filename,
        size,
        data,
        mimeType,
      },
    });

    const { stdout } = await runPythonScript(
      scriptPath,
      [absolutePath, preparedPrompt],
      { input: payload }
    );

    const trimmedOutput = stdout.trim();

    if (!trimmedOutput) {
      throw new Error('Le script LLaVA n\'a produit aucune sortie.');
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmedOutput);
    } catch (error) {
      throw new Error(`Réponse LLaVA invalide : ${error.message}`);
    }

    const text = parsed?.text?.trim?.();

    if (!text) {
      throw new Error('La réponse LLaVA ne contient pas de texte.');
    }

    return {
      text,
      raw: parsed,
    };
  },
};

export default llavaVisionEngine;
