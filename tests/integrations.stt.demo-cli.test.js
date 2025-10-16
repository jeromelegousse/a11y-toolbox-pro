import { beforeEach, describe, expect, it, vi } from 'vitest';

const openAiTranscribe = vi.fn(async () => ({ text: 'openai' }));
const deepgramTranscribe = vi.fn(async () => ({ text: 'deepgram' }));
const assemblyTranscribe = vi.fn(async () => ({ text: 'assembly' }));
const googleTranscribe = vi.fn(async () => ({ text: 'google' }));
const azureTranscribe = vi.fn(async () => ({ text: 'azure' }));

vi.mock('../src/integrations/stt/openai-whisper.js', () => ({
  openAiWhisperEngine: { id: 'openai-whisper', transcribe: openAiTranscribe },
}));

vi.mock('../src/integrations/stt/deepgram.js', () => ({
  deepgramEngine: { id: 'deepgram', transcribe: deepgramTranscribe },
}));

vi.mock('../src/integrations/stt/assemblyai.js', () => ({
  assemblyAiEngine: { id: 'assemblyai', transcribe: assemblyTranscribe },
}));

vi.mock('../src/integrations/stt/google-cloud.js', () => ({
  googleCloudSttEngine: { id: 'google-cloud-stt', transcribe: googleTranscribe },
}));

vi.mock('../src/integrations/stt/azure-speech.js', () => ({
  azureSpeechEngine: { id: 'azure-speech', transcribe: azureTranscribe },
}));

const loadEnvironmentMock = vi.fn();

vi.mock('../scripts/integrations/env.js', () => ({
  loadEnvironment: loadEnvironmentMock,
}));

const existsSyncMock = vi.fn(() => true);

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  default: { existsSync: existsSyncMock },
}));

beforeEach(() => {
  vi.resetModules();
  openAiTranscribe.mockClear();
  deepgramTranscribe.mockClear();
  assemblyTranscribe.mockClear();
  googleTranscribe.mockClear();
  azureTranscribe.mockClear();
  loadEnvironmentMock.mockClear();
  existsSyncMock.mockReturnValue(true);
  process.exitCode = undefined;
});

describe('demo-stt CLI', () => {
  it('appelle le moteur demandé avec les options pertinentes', async () => {
    const originalArgv = process.argv;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    process.argv = [
      'node',
      'demo-stt',
      '--file=./fixtures/audio.wav',
      '--engine=deepgram',
      '--language=fr-FR',
      '--channels=2',
      '--diarize=true',
    ];

    await import('../scripts/integrations/demo-stt.js');

    expect(loadEnvironmentMock).toHaveBeenCalled();
    expect(deepgramTranscribe).toHaveBeenCalledTimes(1);
    const callArgs = deepgramTranscribe.mock.calls[0][0];
    expect(callArgs.filePath).toContain('fixtures/audio.wav');
    expect(callArgs.language).toBe('fr-FR');
    expect(callArgs.channels).toBe(2);
    expect(callArgs.diarize).toBe(true);

    expect(openAiTranscribe).not.toHaveBeenCalled();
    expect(assemblyTranscribe).not.toHaveBeenCalled();
    expect(googleTranscribe).not.toHaveBeenCalled();
    expect(azureTranscribe).not.toHaveBeenCalled();

    expect(logSpy).toHaveBeenCalled();
    const payload = JSON.parse(logSpy.mock.calls.at(-1)[0]);
    expect(payload.engine).toBe('deepgram');
    expect(payload.text).toBe('deepgram');

    process.argv = originalArgv;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
