import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const SCRIPTS_DIR = resolve('scripts', 'integrations');

async function createTempWave() {
  const dir = await mkdtemp(join(tmpdir(), 'stt-script-'));
  const filePath = join(dir, 'sample.wav');

  // Génère un fichier WAV PCM 16 bits minimaliste (silence).
  const header = Buffer.alloc(44);
  const data = Buffer.alloc(160);
  const totalSize = header.length + data.length - 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(totalSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat PCM
  header.writeUInt16LE(1, 22); // NumChannels
  header.writeUInt32LE(16000, 24); // SampleRate
  header.writeUInt32LE(16000 * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  await writeFile(filePath, Buffer.concat([header, data]));

  return { dir, filePath };
}

async function runPythonScript(scriptName, args = [], env = {}) {
  const commandArgs = [resolve(SCRIPTS_DIR, scriptName), ...args];
  return execFileAsync(process.env.A11Y_TOOLBOX_STT_PYTHON || 'python3', commandArgs, {
    env: { ...process.env, ...env },
  });
}

async function runNodeScript(scriptName, args = [], env = {}) {
  const commandArgs = [resolve(SCRIPTS_DIR, scriptName), ...args];
  return execFileAsync(process.execPath, commandArgs, {
    env: { ...process.env, ...env },
  });
}

describe('scripts/integrations/*', () => {
  let tempDir;
  let tempFile;

  beforeAll(async () => {
    const { dir, filePath } = await createTempWave();
    tempDir = dir;
    tempFile = filePath;
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('whisper_local.py', () => {
    it('signale les dépendances manquantes', async () => {
      await expect(
        runPythonScript('whisper_local.py', [`--file=${tempFile}`], {
          A11Y_TOOLBOX_STT_FORCE_MISSING: '1',
        })
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Le module 'faster-whisper' est requis"),
      });
    });

    it('sérialise un résultat JSON en mode mock', async () => {
      const { stdout } = await runPythonScript(
        'whisper_local.py',
        [`--file=${tempFile}`, '--language=fr'],
        {
          A11Y_TOOLBOX_STT_MOCK_TEXT: 'transcription de test',
        }
      );

      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        engine: 'faster-whisper',
        text: 'transcription de test',
        language: 'fr',
      });
    });
  });

  describe('vosk-transcribe.js', () => {
    it('signale les dépendances manquantes', async () => {
      await expect(
        runNodeScript('vosk-transcribe.js', [`--file=${tempFile}`], {
          A11Y_TOOLBOX_STT_FORCE_MISSING: '1',
        })
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Le package 'vosk' est requis"),
      });
    });

    it('retourne un JSON mocké', async () => {
      const { stdout } = await runNodeScript('vosk-transcribe.js', [`--file=${tempFile}`], {
        A11Y_TOOLBOX_STT_MOCK_TEXT: 'mock vosk',
      });

      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        engine: 'vosk',
        text: 'mock vosk',
      });
    });
  });

  describe('parakeet.py', () => {
    it('signale les dépendances manquantes', async () => {
      await expect(
        runPythonScript('parakeet.py', [`--file=${tempFile}`], {
          A11Y_TOOLBOX_STT_FORCE_MISSING: '1',
        })
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("Le module 'nemo_toolkit[asr]' est requis"),
      });
    });

    it('retourne un JSON mocké', async () => {
      const { stdout } = await runPythonScript('parakeet.py', [`--file=${tempFile}`], {
        A11Y_TOOLBOX_STT_MOCK_TEXT: 'mock parakeet',
      });

      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        engine: 'parakeet',
        text: 'mock parakeet',
      });
    });
  });
});
