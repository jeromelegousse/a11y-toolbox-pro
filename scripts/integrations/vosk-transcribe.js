#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function printError(message) {
  process.stderr.write(`${message}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
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

function ensureFile(filePath) {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`Le fichier ${absolute} est introuvable.`);
  }
  return absolute;
}

function parseWaveHeader(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Le fichier doit être au format WAV PCM (entête RIFF manquant).');
  }

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const alignedSize = chunkSize + (chunkSize % 2);

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      data = buffer.slice(chunkStart, chunkStart + chunkSize);
    }

    offset = chunkStart + alignedSize;
  }

  if (!fmt || !data) {
    throw new Error('Le fichier WAV ne contient pas les sections fmt/data attendues.');
  }

  if (fmt.audioFormat !== 1) {
    throw new Error('Seuls les fichiers PCM linéaires (audioFormat=1) sont pris en charge.');
  }

  if (fmt.bitsPerSample !== 16) {
    throw new Error('Le moteur Vosk requiert un flux PCM 16 bits.');
  }

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    buffer: data,
  };
}

async function ensureVosk() {
  if (process.env.A11Y_TOOLBOX_STT_FORCE_MISSING === '1') {
    throw new Error("Le package 'vosk' est requis. Installez-le via 'npm install vosk'.");
  }

  try {
    const imported = await import('vosk');
    return imported.default ?? imported;
  } catch (error) {
    throw new Error("Le package 'vosk' est requis. Installez-le via 'npm install vosk'.");
  }
}

async function transcribe({ filePath, language }) {
  const mockText = process.env.A11Y_TOOLBOX_STT_MOCK_TEXT;
  if (mockText !== undefined) {
    return {
      engine: 'vosk',
      file: filePath,
      text: mockText,
      language,
    };
  }

  const vosk = await ensureVosk();
  const modelPath = process.env.VOSK_MODEL_PATH;

  if (!modelPath) {
    throw new Error(
      "Définissez la variable d'environnement VOSK_MODEL_PATH vers le dossier du modèle."
    );
  }

  const audioBuffer = readFileSync(filePath);
  const wave = parseWaveHeader(audioBuffer);

  const Model = vosk.Model || vosk.model || vosk.default;
  const KaldiRecognizer = vosk.KaldiRecognizer || vosk.Recognizer || vosk.KaldiRecognizer;

  if (!Model || !KaldiRecognizer) {
    throw new Error(
      'Le module vosk ne fournit pas les classes attendues (Model, KaldiRecognizer).'
    );
  }

  const model = new Model(modelPath);
  const sampleRate = Number(process.env.VOSK_SAMPLE_RATE || wave.sampleRate);
  const recognizer = new KaldiRecognizer(model, sampleRate);
  recognizer.setWords?.(true);
  recognizer.SetWords?.(true);

  const chunkSize = 4000;
  for (let offset = 0; offset < wave.buffer.length; offset += chunkSize) {
    const slice = wave.buffer.subarray(offset, offset + chunkSize);
    recognizer.acceptWaveform?.(slice);
    recognizer.AcceptWaveform?.(slice);
  }

  const finalResult = recognizer.finalResult?.() || recognizer.FinalResult?.();
  const partialResult = finalResult || recognizer.result?.() || recognizer.Result?.();

  if (!partialResult) {
    return {
      engine: 'vosk',
      file: filePath,
      text: '',
      language,
      sampleRate,
    };
  }

  let payload;
  try {
    payload = JSON.parse(partialResult);
  } catch (error) {
    throw new Error(`Réponse Vosk invalide: ${error.message}`);
  }

  return {
    engine: 'vosk',
    file: filePath,
    text: payload.text || '',
    language,
    result: payload,
    sampleRate,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    printError('Argument --file manquant.');
    process.exit(1);
    return;
  }

  let absoluteFile;
  try {
    absoluteFile = ensureFile(args.file);
  } catch (error) {
    printError(error.message);
    process.exit(1);
    return;
  }

  try {
    const result = await transcribe({ filePath: absoluteFile, language: args.language });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    printError(error.message);
    process.exit(1);
  }
}

main();
