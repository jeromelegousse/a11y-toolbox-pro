#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvironment } from './env.js';
import { speechEngines } from '../../src/integrations/stt/index.js';

const ENGINES = speechEngines;

function printUsage() {
  const engineIds = Array.from(ENGINES.keys()).join('|');
  console.log(`Usage : npm run demo:stt -- --file=./audio.wav [--engine=${engineIds}] [--language=fr]`);
}

function parseArgs(rawArgs) {
  const [defaultEngine] = ENGINES.keys();
  const args = { engine: defaultEngine };

  for (const token of rawArgs) {
    if (!token.startsWith('--')) {
      continue;
    }
    const [key, value] = token.slice(2).split('=');
    if (!value) {
      continue;
    }
    args[key] = value;
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

  const result = await engine.transcribe({
    filePath: absoluteFile,
    language: args.language
  });

  console.log(JSON.stringify({
    engine: engine.id,
    file: absoluteFile,
    text: result.text,
    raw: result
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
