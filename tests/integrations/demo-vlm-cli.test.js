import { rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadEnvironmentMock = vi.fn();
const analyzeMock = vi.fn();
const llavaRemoteAnalyzeMock = vi.fn();
const llavaLocalAnalyzeMock = vi.fn();

vi.mock('../../scripts/integrations/env.js', () => ({
  loadEnvironment: loadEnvironmentMock,
  requireEnv: vi.fn(),
}));

vi.mock('../../src/integrations/vision/openai-gpt4o.js', () => ({
  openAiGpt4oEngine: {
    id: 'openai-gpt4o',
    analyze: analyzeMock,
  },
}));

vi.mock('../../src/integrations/vision/google-gemini.js', () => ({
  googleGeminiVisionEngine: {
    id: 'google-gemini',
    analyze: vi.fn(),
  },
}));

vi.mock('../../src/integrations/vision/moondream.js', () => ({
  moondreamVisionEngine: {
    id: 'moondream',
    analyze: vi.fn(),
  },
}));

vi.mock('../../src/integrations/vision/llava.js', () => ({
  llavaRemoteVisionEngine: {
    id: 'llava',
    analyze: llavaRemoteAnalyzeMock,
  },
  llavaLocalVisionEngine: {
    id: 'llava-local',
    analyze: llavaLocalAnalyzeMock,
  },
  default: {
    id: 'llava',
    analyze: llavaRemoteAnalyzeMock,
  },
}));

describe('demo-vlm CLI', () => {
  const originalArgv = [...process.argv];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  let tempImagePath;

  beforeEach(async () => {
    vi.resetModules();
    loadEnvironmentMock.mockReset();
    analyzeMock.mockReset();
    llavaRemoteAnalyzeMock.mockReset();
    llavaLocalAnalyzeMock.mockReset();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.argv = [...originalArgv];

    tempImagePath = './tmp-demo-vlm.png';
    await writeFile(tempImagePath, 'temp');
  });

  afterEach(async () => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.argv = [...originalArgv];
    if (tempImagePath) {
      await rm(tempImagePath, { force: true });
    }
  });

  it('affiche un JSON structuré avec le moteur par défaut', async () => {
    llavaRemoteAnalyzeMock.mockResolvedValue({ text: 'Analyse synthétique' });
    const logs = [];
    const errors = [];
    console.log = (message) => logs.push(message);
    console.error = (message) => errors.push(message);

    process.argv = ['node', 'demo-vlm.js', `--image=${tempImagePath}`, '--prompt=Bonjour'];

    await import('../../scripts/integrations/demo-vlm.js');

    expect(errors).toEqual([]);
    expect(loadEnvironmentMock).toHaveBeenCalled();
    expect(llavaRemoteAnalyzeMock).toHaveBeenCalledTimes(1);
    const analyzeArgs = llavaRemoteAnalyzeMock.mock.calls.at(-1)?.[0];
    expect(analyzeArgs).toMatchObject({ prompt: 'Bonjour' });
    expect(analyzeArgs.imagePath).toContain('tmp-demo-vlm.png');

    const output = JSON.parse(logs.at(-1));
    expect(output).toMatchObject({
      engine: 'llava',
      prompt: 'Bonjour',
      text: 'Analyse synthétique',
    });
  });

  it('accepte le moteur LLaVA sur Hugging Face', async () => {
    llavaRemoteAnalyzeMock.mockResolvedValue({ text: 'Réponse cloud' });
    const logs = [];
    console.log = (message) => logs.push(message);

    process.argv = [
      'node',
      'demo-vlm.js',
      `--image=${tempImagePath}`,
      '--prompt=Hello',
      '--engine=llava',
    ];

    await import('../../scripts/integrations/demo-vlm.js');

    expect(llavaRemoteAnalyzeMock).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Hello' }));

    const output = JSON.parse(logs.at(-1));
    expect(output.engine).toBe('llava');
    expect(output.text).toBe('Réponse cloud');
  });

  it('accepte le moteur local LLaVA', async () => {
    llavaLocalAnalyzeMock.mockResolvedValue({ text: 'Réponse locale' });
    const logs = [];
    console.log = (message) => logs.push(message);

    process.argv = [
      'node',
      'demo-vlm.js',
      `--image=${tempImagePath}`,
      '--prompt=Hello',
      '--engine=llava-local',
    ];

    await import('../../scripts/integrations/demo-vlm.js');

    expect(llavaLocalAnalyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Hello' })
    );

    const output = JSON.parse(logs.at(-1));
    expect(output.engine).toBe('llava-local');
    expect(output.text).toBe('Réponse locale');
  });
});
