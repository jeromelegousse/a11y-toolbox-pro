#!/usr/bin/env node
import { loadEnvironment } from './env.js';
import { openAiGpt4oEngine } from '../../src/integrations/vision/openai-gpt4o.js';
import { googleGeminiVisionEngine } from '../../src/integrations/vision/google-gemini.js';
import { moondreamVisionEngine } from '../../src/integrations/vision/moondream.js';
import {
  llavaRemoteVisionEngine,
  llavaLocalVisionEngine,
} from '../../src/integrations/vision/llava.js';

function normalizeEngine(candidate, { id, analyze }) {
  if (!candidate || typeof candidate !== 'object') {
    return { id, analyze };
  }

  const resolvedId = typeof candidate.id === 'string' ? candidate.id : id;
  const resolvedAnalyze =
    typeof candidate.analyze === 'function'
      ? candidate.analyze
      : analyze;

  return { ...candidate, id: resolvedId, analyze: resolvedAnalyze };
}

const llavaRemoteVisionEngine = normalizeEngine(llavaVisionEngine?.remote, {
  id: 'llava',
  analyze: llavaVisionEngine?.remoteAnalyze ?? llavaVisionEngine?.analyze,
});

const llavaLocalVisionEngine = normalizeEngine(llavaVisionEngine?.local, {
  id: 'llava-local',
  analyze: llavaVisionEngine?.localAnalyze ?? llavaVisionEngine?.analyze,
});

const ENGINES = new Map(
  [
    openAiGpt4oEngine,
    googleGeminiVisionEngine,
    moondreamVisionEngine,
    llavaRemoteVisionEngine,
    llavaLocalVisionEngine,
  ]
    .filter((engine) => engine && typeof engine.id === 'string')
    .map((engine) => [engine.id, engine])
);

const DEFAULT_ENGINE = llavaRemoteVisionEngine.id;

function printUsage() {
  console.log(
    'Usage : npm run demo:vlm -- --image=./capture.png|https://exemple.tld/image.png --prompt="Décrire la scène" [--engine=openai-gpt4o|google-gemini|moondream|llava|llava-local]'
  );
}

function parseArgs(rawArgs) {
  const args = { engine: DEFAULT_ENGINE, engineProvided: false };

  for (const token of rawArgs) {
    if (!token.startsWith('--')) {
      continue;
    }

    const [key, value] = token.slice(2).split('=');
    if (!value) {
      continue;
    }

    if (key === 'engine') {
      args.engineProvided = true;
    }

    args[key] = value;
  }

  return args;
}

async function main() {
  loadEnvironment();
  const args = parseArgs(process.argv.slice(2));

  if (!args.image || !args.prompt) {
    printUsage();
    throw new Error('Les arguments --image et --prompt sont obligatoires.');
  }

  const engine = ENGINES.get(args.engine);
  if (!engine) {
    printUsage();
    throw new Error(`Moteur inconnu : ${args.engine}`);
  }

  if (typeof engine.analyze !== 'function') {
    throw new Error(`Le moteur ${engine.id} ne définit pas de méthode analyze().`);
  }

  const absoluteImage = resolve(args.image);
  if (!existsSync(absoluteImage)) {
    throw new Error(`Le fichier ${absoluteImage} est introuvable.`);
  }

  const result = await engine.analyze({
    imagePath: image.absolutePath,
    prompt: args.prompt,
  });

  console.log(
    JSON.stringify(
      {
        engine: args.engineProvided ? engine.id : DEFAULT_ENGINE_OUTPUT,
        image: absoluteImage,
        prompt: args.prompt,
        text: result.text,
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
