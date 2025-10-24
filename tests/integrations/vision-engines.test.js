import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireEnvMock = vi.fn();
const loadImageAsBase64Mock = vi.fn();
const execFileMock = vi.fn();
const getLlavaRemoteConfigMock = vi.fn().mockResolvedValue(null);

vi.mock('../../scripts/integrations/env.js', () => ({
  requireEnv: requireEnvMock,
}));

vi.mock('../../src/integrations/vision/utils.js', () => ({
  loadImageAsBase64: loadImageAsBase64Mock,
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  default: { execFile: execFileMock },
}));

vi.mock('../../src/integrations/vision/remote-config.js', () => ({
  getLlavaRemoteConfig: getLlavaRemoteConfigMock,
}));

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(payload),
  };
}

beforeEach(() => {
  vi.resetModules();
  requireEnvMock.mockReset();
  loadImageAsBase64Mock.mockReset();
  execFileMock.mockReset();
  getLlavaRemoteConfigMock.mockReset();
  getLlavaRemoteConfigMock.mockResolvedValue(null);
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe('openAiGpt4oEngine', () => {
  it('retourne le texte de la réponse', async () => {
    requireEnvMock.mockImplementation((key) => `${key}-value`);
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(createJsonResponse({ output_text: 'Chat détecté.' }));

    const { openAiGpt4oEngine } = await import('../../src/integrations/vision/openai-gpt4o.js');
    const result = await openAiGpt4oEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(requireEnvMock).toHaveBeenCalledWith('OPENAI_API_KEY');
    expect(loadImageAsBase64Mock).toHaveBeenCalledWith('./image.png');
    expect(result.text).toBe('Chat détecté.');
  });

  it('signale une erreur lorsque le texte est absent', async () => {
    requireEnvMock.mockReturnValue('openai-key');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(createJsonResponse({}));

    const { openAiGpt4oEngine } = await import('../../src/integrations/vision/openai-gpt4o.js');

    await expect(
      openAiGpt4oEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toThrow('La réponse OpenAI ne contient pas de texte.');
  });
});

describe('googleGeminiVisionEngine', () => {
  it('assemble les fragments de texte renvoyés', async () => {
    requireEnvMock.mockReturnValue('gemini-key');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(
      createJsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: 'Première ligne' }, { text: 'Deuxième ligne' }],
            },
          },
        ],
      })
    );

    const { googleGeminiVisionEngine } = await import(
      '../../src/integrations/vision/google-gemini.js'
    );
    const result = await googleGeminiVisionEngine.analyze({
      imagePath: './image.png',
      prompt: 'Décrire',
    });

    expect(requireEnvMock).toHaveBeenCalledWith('GEMINI_API_KEY');
    expect(result.text).toBe('Première ligne\nDeuxième ligne');
  });

  it('signale une erreur si aucun candidat texte', async () => {
    requireEnvMock.mockReturnValue('gemini-key');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(createJsonResponse({ candidates: [] }));

    const { googleGeminiVisionEngine } = await import(
      '../../src/integrations/vision/google-gemini.js'
    );

    await expect(
      googleGeminiVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toThrow('La réponse Gemini ne contient pas de texte.');
  });
});

describe('moondreamVisionEngine', () => {
  it('retourne le contenu du premier choix', async () => {
    requireEnvMock.mockReturnValue('moon-key');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: { content: 'Réponse Moondream' },
          },
        ],
      })
    );

    const { moondreamVisionEngine } = await import('../../src/integrations/vision/moondream.js');
    const result = await moondreamVisionEngine.analyze({
      imagePath: './image.png',
      prompt: 'Décrire',
    });

    expect(requireEnvMock).toHaveBeenCalledWith('MOONDREAM_API_KEY');
    expect(result.text).toBe('Réponse Moondream');
  });

  it('signale une erreur si la réponse est vide', async () => {
    requireEnvMock.mockReturnValue('moon-key');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(createJsonResponse({ choices: [] }));

    const { moondreamVisionEngine } = await import('../../src/integrations/vision/moondream.js');

    await expect(
      moondreamVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toThrow('La réponse Moondream ne contient pas de texte.');
  });
});

describe('llavaRemoteVisionEngine', () => {
  it('retourne le texte généré', async () => {
    requireEnvMock.mockReturnValue('hf-token');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(
      createJsonResponse([
        {
          generated_text: 'Réponse distante',
        },
      ])
    );

    const { llavaRemoteVisionEngine } = await import('../../src/integrations/vision/llava.js');
    const result = await llavaRemoteVisionEngine.analyze({
      imagePath: './image.png',
      prompt: 'Décrire',
    });

    expect(requireEnvMock).toHaveBeenCalledWith('HUGGINGFACE_API_TOKEN');
    expect(result.text).toBe('Réponse distante');
  });

  it('signale une erreur lorsque le texte est absent', async () => {
    requireEnvMock.mockReturnValue('hf-token');
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(createJsonResponse([{ other: 'value' }]));

    const { llavaRemoteVisionEngine } = await import('../../src/integrations/vision/llava.js');

    await expect(
      llavaRemoteVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toThrow('La réponse LLaVA ne contient pas de texte.');
  });

  it('utilise la configuration distante lorsqu’elle est disponible', async () => {
    getLlavaRemoteConfigMock.mockResolvedValue({
      endpoint: 'https://proxy.example.test/vision',
      token: 'remote-token',
    });
    loadImageAsBase64Mock.mockResolvedValue({ data: 'AAA=', mimeType: 'image/png' });
    globalThis.fetch.mockResolvedValue(
      createJsonResponse([
        {
          generated_text: 'Réponse distante',
        },
      ])
    );

    const { llavaRemoteVisionEngine } = await import('../../src/integrations/vision/llava.js');
    const result = await llavaRemoteVisionEngine.analyze({
      imagePath: './image.png',
      prompt: 'Décrire',
    });

    expect(requireEnvMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = globalThis.fetch.mock.calls[0];
    expect(endpoint).toBe('https://proxy.example.test/vision');
    expect(options.headers.Authorization).toBe('Bearer remote-token');
    expect(result.text).toBe('Réponse distante');
  });
});

describe('llavaLocalVisionEngine', () => {
  it('retourne le texte renvoyé par le script local', async () => {
    execFileMock.mockImplementation((command, args, options, callback) => {
      callback(null, JSON.stringify({ text: 'Réponse LLaVA', engine: 'llava-local' }), '');
    });

    loadImageAsBase64Mock.mockResolvedValue({
      data: 'AAA=',
      mimeType: 'image/png',
      absolutePath: '/tmp/image.png',
    });

    const { llavaLocalVisionEngine } = await import('../../src/integrations/vision/llava.js');
    const result = await llavaLocalVisionEngine.analyze({
      imagePath: './image.png',
      prompt: 'Décrire',
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('Réponse LLaVA');
    expect(result.raw).toEqual({ text: 'Réponse LLaVA', engine: 'llava-local' });
  });

  it('signale une erreur lorsque le texte est absent', async () => {
    execFileMock.mockImplementation((command, args, options, callback) => {
      callback(null, JSON.stringify({ engine: 'llava-local' }), '');
    });

    loadImageAsBase64Mock.mockResolvedValue({
      data: 'AAA=',
      mimeType: 'image/png',
      absolutePath: '/tmp/image.png',
    });

    const { llavaLocalVisionEngine } = await import('../../src/integrations/vision/llava.js');

    await expect(
      llavaLocalVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toThrow('La réponse LLaVA ne contient pas de texte.');
  });

  it('expose les métadonnées REST lorsque le script échoue', async () => {
    execFileMock.mockImplementation((command, args, options, callback) => {
      const error = new Error('Execution failed');
      error.code = 13;
      callback(error, '', 'Les modules manquent');
    });

    loadImageAsBase64Mock.mockResolvedValue({
      data: 'AAA=',
      mimeType: 'image/png',
      absolutePath: '/tmp/image.png',
    });

    const { llavaLocalVisionEngine } = await import('../../src/integrations/vision/llava.js');

    await expect(
      llavaLocalVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toMatchObject({
      name: 'LlavaLocalError',
      status: 501,
      exitCode: 13,
      errorType: 'DEPENDENCY_MISSING',
      rest: {
        status: 501,
        body: {
          ok: false,
          error: {
            type: 'DEPENDENCY_MISSING',
            exitCode: 13,
            message: 'Les modules manquent',
          },
        },
      },
    });
  });

  it('convertit une interruption du script en timeout REST', async () => {
    execFileMock.mockImplementation((command, args, options, callback) => {
      const error = new Error('Signal reçu');
      error.killed = true;
      error.signal = 'SIGTERM';
      callback(error, '', '');
    });

    loadImageAsBase64Mock.mockResolvedValue({
      data: 'AAA=',
      mimeType: 'image/png',
      absolutePath: '/tmp/image.png',
    });

    const { llavaLocalVisionEngine } = await import('../../src/integrations/vision/llava.js');

    await expect(
      llavaLocalVisionEngine.analyze({ imagePath: './image.png', prompt: 'Décrire' })
    ).rejects.toMatchObject({
      name: 'LlavaLocalError',
      status: 504,
      errorType: 'LLAVA_TIMEOUT',
      rest: {
        status: 504,
        body: {
          ok: false,
          error: {
            type: 'LLAVA_TIMEOUT',
          },
        },
      },
    });
  });
});
