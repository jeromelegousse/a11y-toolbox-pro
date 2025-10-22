import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const DEFAULT_PYTHON = process.env.A11Y_TOOLBOX_VLM_PYTHON || 'python3';
const SCRIPT_PATH = resolve('scripts', 'integrations', 'llava_local.py');

function ensureImagePath(imagePath) {
  if (!imagePath) {
    throw new Error('Le paramètre "imagePath" est obligatoire pour LLaVA.');
  }

  return resolve(imagePath);
}

function ensurePrompt(prompt) {
  if (!prompt) {
    throw new Error('Le paramètre "prompt" est obligatoire pour LLaVA.');
  }

  return prompt;
}

function runScript(pythonExecutable, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(pythonExecutable, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        rejectPromise(error);
        return;
      }

      resolvePromise({ stdout, stderr });
    });
  });
}

export const llavaVisionEngine = {
  id: 'llava-local',
  async analyze({ imagePath, prompt } = {}) {
    const absoluteImagePath = ensureImagePath(imagePath);
    const preparedPrompt = ensurePrompt(prompt);

    const { stdout } = await runScript(
      DEFAULT_PYTHON,
      [
        SCRIPT_PATH,
        '--engine=llava-local',
        '--format=json',
        '--image',
        absoluteImagePath,
        '--prompt',
        preparedPrompt,
      ],
      {
        env: process.env,
      }
    );

    let payload;

    try {
      payload = JSON.parse(stdout);
    } catch (error) {
      throw new Error("La sortie du script LLaVA n'est pas un JSON valide.");
    }

    const text = payload?.text?.trim();

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
