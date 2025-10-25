#!/usr/bin/env node
import { loadEnvironment } from './env.js';
import { openAiGpt4oEngine } from '../../src/integrations/vision/openai-gpt4o.js';
import { googleGeminiVisionEngine } from '../../src/integrations/vision/google-gemini.js';
import { moondreamVisionEngine } from '../../src/integrations/vision/moondream.js';
import {
  llavaVisionEngine,
  llavaRemoteVisionEngine,
  llavaLocalVisionEngine,
} from '../../src/integrations/vision/llava.js';
import { ensureLocalImage } from '../../src/integrations/vision/utils.js';

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

const normalizedLlavaRemoteEngine = normalizeEngine(
  llavaRemoteVisionEngine ?? llavaVisionEngine?.remote,
  {
    id: llavaVisionEngine?.id ?? 'llava',
    analyze: llavaVisionEngine?.remoteAnalyze ?? llavaVisionEngine?.analyze,
  }
);

const normalizedLlavaLocalEngine = normalizeEngine(
  llavaLocalVisionEngine ?? llavaVisionEngine?.local,
  {
    id: 'llava-local',
    analyze: llavaVisionEngine?.localAnalyze ?? llavaVisionEngine?.analyze,
  }
);

const ENGINES = new Map(
  [
    openAiGpt4oEngine,
    googleGeminiVisionEngine,
    moondreamVisionEngine,
    normalizedLlavaRemoteEngine,
    normalizedLlavaLocalEngine,
  ]
    .filter((engine) => engine && typeof engine.id === 'string')
    .map((engine) => [engine.id, engine])
);

const DEFAULT_ENGINE = normalizedLlavaRemoteEngine.id;
const DEFAULT_ENGINE_OUTPUT = normalizedLlavaRemoteEngine.id;
const CANONICAL_ENGINE_IDS = new Map([[normalizedLlavaLocalEngine.id, DEFAULT_ENGINE]]);

if (!ENGINES.has(DEFAULT_ENGINE)) {
  throw new Error(`Le moteur par défaut "${DEFAULT_ENGINE}" n'est pas enregistré.`);
}
if (!ENGINES.has(DEFAULT_ENGINE_OUTPUT)) {
  throw new Error(
    `Le moteur d'affichage par défaut "${DEFAULT_ENGINE_OUTPUT}" n'est pas enregistré.`
  );
}

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

  let image;
  try {
    image = await ensureLocalImage(args.image);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Le fichier ${args.image} est introuvable.`);
    }
    throw error;
  }

  const result = await engine.analyze({
    imagePath: image.absolutePath,
    prompt: args.prompt,
  });

  const canonicalEngineId = CANONICAL_ENGINE_IDS.get(engine.id) ?? engine.id;
  const engineForOutput = args.engineProvided ? canonicalEngineId : DEFAULT_ENGINE_OUTPUT;

  console.log(
    JSON.stringify(
      {
        engine: engineForOutput,
        image: image.originalPath ?? args.image,
        cachedImagePath: image.absolutePath,
        prompt: args.prompt,
        text: result?.text ?? '',
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
