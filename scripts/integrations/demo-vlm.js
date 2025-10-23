#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvironment } from './env.js';
import { openAiGpt4oEngine } from '../../src/integrations/vision/openai-gpt4o.js';
import { googleGeminiVisionEngine } from '../../src/integrations/vision/google-gemini.js';
import { moondreamVisionEngine } from '../../src/integrations/vision/moondream.js';
import { llavaLocalEngine } from '../../src/integrations/vision/llava-local.js';

const ENGINES = new Map([
  [openAiGpt4oEngine.id, openAiGpt4oEngine],
  [googleGeminiVisionEngine.id, googleGeminiVisionEngine],
  [moondreamVisionEngine.id, moondreamVisionEngine],
  [llavaLocalEngine.id, llavaLocalEngine],
]);

function printUsage() {
  console.log(
    'Usage : npm run demo:vlm -- --image=./capture.png --prompt="Décrire la scène" [--engine=openai-gpt4o|google-gemini|moondream|llava]'
  );
}

function parseArgs(rawArgs) {
  const args = { engine: openAiGpt4oEngine.id };

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

  const absoluteImage = resolve(args.image);
  if (!existsSync(absoluteImage)) {
    throw new Error(`Le fichier ${absoluteImage} est introuvable.`);
  }

  const result = await engine.analyze({
    imagePath: absoluteImage,
    prompt: args.prompt,
  });

  console.log(
    JSON.stringify(
      {
        engine: engine.id,
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
