import process from 'node:process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { openAiWhisperEngine } from './openai-whisper.js';

const projectRoot = dirname(dirname(dirname(fileURLToPath(new URL('.', import.meta.url)))));
const integrationsDir = join(projectRoot, 'scripts', 'integrations');

function parseJsonPayload(rawOutput) {
  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    throw new Error(`Impossible de parser la sortie JSON: ${error.message}`);
  }
}

export class LocalSpeechEngine {
  constructor({ id, command, args = [], env = {}, parser = parseJsonPayload }) {
    if (!id) {
      throw new Error('Un identifiant est requis pour instancier LocalSpeechEngine.');
    }
    this.id = id;
    this.command = command;
    this.args = args;
    this.env = env;
    this.parser = parser;
  }

  async transcribe({ filePath, language } = {}) {
    if (!filePath) {
      throw new Error('Le paramètre "filePath" est obligatoire.');
    }

    const runtimeArgs = [...this.args, `--file=${filePath}`];
    if (language) {
      runtimeArgs.push(`--language=${language}`);
    }

    const subprocess = spawn(this.command, runtimeArgs, {
      env: { ...process.env, ...this.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    subprocess.stdout.setEncoding('utf8');
    subprocess.stderr.setEncoding('utf8');

    subprocess.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    subprocess.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    subprocess.stdin?.end?.();

    const closePromise = once(subprocess, 'close');
    const errorPromise = once(subprocess, 'error').then(([error]) => {
      throw error;
    });

    let code;
    try {
      [code] = await Promise.race([closePromise, errorPromise]);
    } catch (error) {
      throw new Error(`Impossible d'exécuter le moteur ${this.id}: ${error.message}`);
    }

    if (code !== 0) {
      throw new Error(stderr.trim() || `Le moteur ${this.id} a retourné un code ${code}.`);
    }

    const payload = this.parser(stdout.trim());

    if (!payload || typeof payload.text !== 'string') {
      throw new Error(`La sortie du moteur ${this.id} doit contenir une propriété "text".`);
    }

    return payload;
  }
}

function resolveScript(...segments) {
  return join(integrationsDir, ...segments);
}

const pythonExecutable = process.env.A11Y_TOOLBOX_STT_PYTHON || 'python3';

export const fasterWhisperEngine = new LocalSpeechEngine({
  id: 'faster-whisper',
  command: pythonExecutable,
  args: [resolveScript('whisper_local.py')]
});

export const voskEngine = new LocalSpeechEngine({
  id: 'vosk',
  command: process.execPath,
  args: [resolveScript('vosk-transcribe.js')]
});

export const parakeetEngine = new LocalSpeechEngine({
  id: 'parakeet',
  command: pythonExecutable,
  args: [resolveScript('parakeet.py')]
});

export const speechEngines = new Map([
  [openAiWhisperEngine.id, openAiWhisperEngine],
  [fasterWhisperEngine.id, fasterWhisperEngine],
  [voskEngine.id, voskEngine],
  [parakeetEngine.id, parakeetEngine]
]);

export function getSpeechEngine(engineId) {
  return speechEngines.get(engineId);
}

export default speechEngines;
