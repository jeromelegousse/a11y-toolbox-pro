import { rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadEnvironmentMock = vi.fn();
const analyzeMock = vi.fn();
const llavaRemoteAnalyzeMock = vi.fn();
const llavaLocalAnalyzeMock = vi.fn();
const getLlavaRemoteConfigMock = vi.fn().mockResolvedValue(null);
const ensureLocalImageMock = vi.fn();

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
  llavaVisionEngine: {
    id: 'llava',
    analyze: llavaRemoteAnalyzeMock,
    remote: { id: 'llava', analyze: llavaRemoteAnalyzeMock },
    remoteAnalyze: llavaRemoteAnalyzeMock,
    local: { id: 'llava-local', analyze: llavaLocalAnalyzeMock },
    localAnalyze: llavaLocalAnalyzeMock,
  },
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

vi.mock('../../src/integrations/vision/remote-config.js', () => ({
  getLlavaRemoteConfig: getLlavaRemoteConfigMock,
}));

vi.mock('../../src/integrations/vision/utils.js', () => ({
  ensureLocalImage: ensureLocalImageMock,
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
    getLlavaRemoteConfigMock.mockReset();
    getLlavaRemoteConfigMock.mockResolvedValue(null);
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
    expect(output.cachedImagePath).toContain('tmp-demo-vlm.png');
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

  it('préserve la compatibilité avec le flag --engine=llava-local', async () => {
    ensureLocalImageMock.mockResolvedValue({
      absolutePath: tempImagePath,
      originalPath: tempImagePath,
      source: 'local',
    });
    llavaAnalyzeMock.mockResolvedValue({ text: 'Réponse locale' });

    const logs = [];
    console.log = (message) => logs.push(message);

    process.argv = [
      'node',
      'demo-vlm.js',
      `--image=${tempImagePath}`,
      '--prompt=Compat',
      '--engine=llava-local',
    ];

    await import('../../scripts/integrations/demo-vlm.js');

    expect(llavaAnalyzeMock).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Compat' }));

    const output = JSON.parse(logs.at(-1));
    expect(output.engine).toBe('llava');
    expect(output.text).toBe('Réponse locale');
  });

  it('récupère une image distante avant de lancer lanalyse', async () => {
    const remoteUrl = 'https://example.com/demo.png';
    ensureLocalImageMock.mockResolvedValue({
      absolutePath: '/tmp/cached/demo.png',
      originalPath: remoteUrl,
      source: 'remote',
    });
    llavaAnalyzeMock.mockResolvedValue({ text: 'Réponse distante' });

    const logs = [];
    console.log = (message) => logs.push(message);

    process.argv = ['node', 'demo-vlm.js', `--image=${remoteUrl}`, '--prompt=Remote'];

    await import('../../scripts/integrations/demo-vlm.js');

    expect(ensureLocalImageMock).toHaveBeenCalledWith(remoteUrl);
    expect(llavaAnalyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: '/tmp/cached/demo.png', prompt: 'Remote' })
    );

    const output = JSON.parse(logs.at(-1));
    expect(output.image).toBe(remoteUrl);
    expect(output.cachedImagePath).toBe('/tmp/cached/demo.png');
    expect(output.text).toBe('Réponse distante');
  });
});
