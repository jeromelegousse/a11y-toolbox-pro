#!/usr/bin/env node
import { loadEnvironment } from './env.js';
import { openAiGpt4oEngine } from '../../src/integrations/vision/openai-gpt4o.js';
import { googleGeminiVisionEngine } from '../../src/integrations/vision/google-gemini.js';
import { moondreamVisionEngine } from '../../src/integrations/vision/moondream.js';
import {
  llavaRemoteVisionEngine,
  llavaLocalVisionEngine,
} from '../../src/integrations/vision/llava.js';

const ENGINES = new Map([
  [openAiGpt4oEngine.id, openAiGpt4oEngine],
  [googleGeminiVisionEngine.id, googleGeminiVisionEngine],
  [moondreamVisionEngine.id, moondreamVisionEngine],
  [llavaVisionEngine.id, llavaVisionEngine],
  ['llava-local', llavaVisionEngine],
]);

const DEFAULT_ENGINE = llavaRemoteVisionEngine.id;

function printUsage() {
  console.log(
    'Usage : npm run demo:vlm -- --image=./capture.png|https://exemple.tld/image.png --prompt="Décrire la scène" [--engine=openai-gpt4o|google-gemini|moondream|llava|llava-local]'
  );
}

function parseArgs(rawArgs) {
  const args = { engine: DEFAULT_ENGINE };

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

  if (!args.image || !args.prompt) {
    printUsage();
    throw new Error('Les arguments --image et --prompt sont obligatoires.');
  }

  const engine = ENGINES.get(args.engine);
  if (!engine) {
    printUsage();
    throw new Error(`Moteur inconnu : ${args.engine}`);
  }

  const image = await ensureLocalImage(args.image);

  const result = await engine.analyze({
    imagePath: image.absolutePath,
    prompt: args.prompt,
  });

  console.log(
    JSON.stringify(
      {
        engine: engine.id,
        image: image.originalPath,
        cachedImagePath: image.absolutePath,
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
