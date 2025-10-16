#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvironment } from './env.js';
import { openAiWhisperEngine } from '../../src/integrations/stt/openai-whisper.js';
import { deepgramEngine } from '../../src/integrations/stt/deepgram.js';
import { assemblyAiEngine } from '../../src/integrations/stt/assemblyai.js';
import { googleCloudSttEngine } from '../../src/integrations/stt/google-cloud.js';
import { azureSpeechEngine } from '../../src/integrations/stt/azure-speech.js';

const ENGINES = new Map([
  [openAiWhisperEngine.id, openAiWhisperEngine],
  [deepgramEngine.id, deepgramEngine],
  [assemblyAiEngine.id, assemblyAiEngine],
  [googleCloudSttEngine.id, googleCloudSttEngine],
  [azureSpeechEngine.id, azureSpeechEngine],
]);

function printUsage() {
  console.log(`Usage : npm run demo:stt -- --file=./audio.wav [options]\n`);
  console.log('Options communes :');
  console.log('  --engine=<id>           Choix du moteur (par défaut : openai-whisper)');
  console.log('  --language=<code>       Langue de transcription (ex : fr, en-US)');
  console.log('  --channels=<n>          Nombre de canaux audio (si supporté)');
  console.log('  --diarize=<true|false>  Active la diarisation si disponible');
  console.log('');
  console.log('Options spécifiques :');
  console.log('  openai-whisper : --model=<nom>');
  console.log('  deepgram       : --model=<nom>');
  console.log('  assemblyai     : --pollIntervalMs=<ms> --maxPolls=<n>');
  console.log('  google-cloud-stt : --sampleRate=<Hz> --encoding=<codec>');
  console.log('  azure-speech   : --region=<override> (sinon AZURE_SPEECH_REGION)');
  console.log('');
  console.log('Moteurs disponibles :');
  for (const id of ENGINES.keys()) {
    console.log(`  - ${id}`);
  }
}

const BOOLEAN_FLAGS = new Set(['diarize']);
const NUMBER_FLAGS = new Set(['channels', 'pollIntervalMs', 'maxPolls', 'sampleRate']);

function coerceValue(key, value) {
  if (BOOLEAN_FLAGS.has(key)) {
    return value === 'true' ? true : value === 'false' ? false : value;
  }
  if (NUMBER_FLAGS.has(key)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

function parseArgs(rawArgs) {
  const [defaultEngine] = ENGINES.keys();
  const args = { engine: defaultEngine };

  for (const token of rawArgs) {
    if (!token.startsWith('--')) {
      continue;
    }
    const [key, value] = token.slice(2).split('=');
    if (typeof value === 'undefined') {
      continue;
    }
    args[key] = coerceValue(key, value);
  }

  return args;
}

async function main() {
  loadEnvironment();
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    printUsage();
    throw new Error('Argument --file manquant.');
  }

  const engine = ENGINES.get(args.engine);
  if (!engine) {
    printUsage();
    throw new Error(`Moteur inconnu : ${args.engine}`);
  }

  const absoluteFile = resolve(args.file);
  if (!existsSync(absoluteFile)) {
    throw new Error(`Le fichier ${absoluteFile} est introuvable.`);
  }

  const { engine: _ignoredEngine, file, ...engineOptions } = args;
  const result = await engine.transcribe({
    filePath: absoluteFile,
    ...engineOptions,
  });

  console.log(
    JSON.stringify(
      {
        engine: engine.id,
        file: absoluteFile,
        text: result.text,
        raw: result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
