import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithRetryMock, parseJsonMock } = vi.hoisted(() => {
  return {
    fetchWithRetryMock: vi.fn(),
    parseJsonMock: vi.fn(),
  };
});

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

const { createSignMock } = vi.hoisted(() => {
  const update = vi.fn().mockReturnThis();
  const sign = vi.fn(() => 'signature');
  return {
    createSignMock: vi.fn(() => ({ update, sign })),
  };
});

const envState = vi.hoisted(() => ({
  values: {},
  google: { path: '/tmp/google.json', data: {} },
}));

const requireEnvMock = vi.fn((key) => {
  const value = envState.values[key];
  if (!value) {
    throw new Error(`Missing env ${key}`);
  }
  return value;
});

const getGoogleCredentialsMock = vi.fn(() => envState.google);

vi.mock('../src/integrations/http-client.js', () => ({
  fetchWithRetry: fetchWithRetryMock,
  parseJson: parseJsonMock,
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  default: { readFile: readFileMock },
}));

vi.mock('node:crypto', () => ({
  createSign: createSignMock,
  default: { createSign: createSignMock },
}));

vi.mock('../scripts/integrations/env.js', () => ({
  requireEnv: requireEnvMock,
  getGoogleCredentials: getGoogleCredentialsMock,
}));

function resetEnv() {
  Object.keys(envState.values).forEach((key) => {
    delete envState.values[key];
  });
  envState.google = { path: '/tmp/google.json', data: {} };
}

beforeEach(() => {
  vi.resetModules();
  fetchWithRetryMock.mockReset();
  parseJsonMock.mockReset();
  readFileMock.mockReset();
  requireEnvMock.mockClear();
  getGoogleCredentialsMock.mockClear();
  resetEnv();
});

function expectUrlIncludes(callIndex, key, expected) {
  const call = fetchWithRetryMock.mock.calls[callIndex];
  expect(call).toBeTruthy();
  const url = call[0];
  expect(url).toBeInstanceOf(URL);
  expect(url.searchParams.get(key)).toBe(expected);
}

describe('clients STT', () => {
  it('deepgramEngine transmet les paramètres de canal et diarisation', async () => {
    envState.values.DEEPGRAM_API_KEY = 'dg-test';
    const audioBuffer = Buffer.from('audio');
    readFileMock.mockResolvedValueOnce(audioBuffer);
    parseJsonMock.mockResolvedValueOnce({
      results: {
        channels: [
          {
            alternatives: [{ transcript: 'Bonjour tout le monde' }],
          },
        ],
      },
    });
    fetchWithRetryMock.mockResolvedValueOnce({});

    const { deepgramEngine } = await import('../src/integrations/stt/deepgram.js');
    const result = await deepgramEngine.transcribe({
      filePath: './audio.wav',
      language: 'fr',
      channels: 2,
      diarize: true,
      model: 'test-model',
    });

    expect(requireEnvMock).toHaveBeenCalledWith('DEEPGRAM_API_KEY');
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1);
    expectUrlIncludes(0, 'language', 'fr');
    expectUrlIncludes(0, 'channels', '2');
    expectUrlIncludes(0, 'diarize', 'true');
    expect(result.text).toBe('Bonjour tout le monde');
    expect(result.raw).toBeTruthy();
  });

  it('assemblyAiEngine gère le cycle complet de transcription', async () => {
    envState.values.ASSEMBLYAI_API_KEY = 'assembly-test';
    const audioBuffer = Buffer.from('audio');
    readFileMock.mockResolvedValueOnce(audioBuffer);

    parseJsonMock
      .mockResolvedValueOnce({ upload_url: 'https://example.com/upload.wav' })
      .mockResolvedValueOnce({ id: 'transcript-id' })
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'completed', text: 'Hello world' });

    fetchWithRetryMock.mockResolvedValue({});

    const { assemblyAiEngine } = await import('../src/integrations/stt/assemblyai.js');
    const result = await assemblyAiEngine.transcribe({
      filePath: './audio.wav',
      language: 'en_us',
      diarize: true,
      pollIntervalMs: 0,
      maxPolls: 5,
    });

    expect(requireEnvMock).toHaveBeenCalledWith('ASSEMBLYAI_API_KEY');
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(4);
    const createCall = fetchWithRetryMock.mock.calls[1];
    expect(createCall[1].body).toContain('"speaker_labels":true');
    expect(result.text).toBe('Hello world');
  });

  it('googleCloudSttEngine construit un access token et fusionne les résultats', async () => {
    envState.google = {
      path: '/tmp/google.json',
      data: {
        client_email: 'service@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n',
      },
    };

    parseJsonMock.mockResolvedValueOnce({ access_token: 'token-123' }).mockResolvedValueOnce({
      results: [
        { alternatives: [{ transcript: 'Bonjour' }] },
        { alternatives: [{ transcript: 'monde' }] },
      ],
    });

    const audioBuffer = Buffer.from('audio');
    readFileMock.mockResolvedValueOnce(audioBuffer);

    fetchWithRetryMock.mockImplementation(async () => ({}));

    const { googleCloudSttEngine } = await import('../src/integrations/stt/google-cloud.js');
    const result = await googleCloudSttEngine.transcribe({
      filePath: './audio.wav',
      language: 'fr-FR',
      channels: 2,
      diarize: true,
      sampleRate: 44100,
      encoding: 'FLAC',
    });

    expect(getGoogleCredentialsMock).toHaveBeenCalled();
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(2);
    const tokenCall = fetchWithRetryMock.mock.calls[0];
    expect(tokenCall[0]).toBe('https://oauth2.googleapis.com/token');
    const apiCall = fetchWithRetryMock.mock.calls[1];
    expect(apiCall[0]).toBe('https://speech.googleapis.com/v1/speech:recognize');
    const body = JSON.parse(apiCall[1].body);
    expect(body.config.encoding).toBe('FLAC');
    expect(body.config.audioChannelCount).toBe(2);
    expect(body.config.diarizationConfig.enableSpeakerDiarization).toBe(true);
    expect(result.text).toBe('Bonjour monde');
  });

  it('azureSpeechEngine applique la région et la diarisation', async () => {
    envState.values.AZURE_SPEECH_KEY = 'azure-key';
    envState.values.AZURE_SPEECH_REGION = 'westeurope';
    const audioBuffer = Buffer.from('audio');
    readFileMock.mockResolvedValueOnce(audioBuffer);
    parseJsonMock.mockResolvedValueOnce({ DisplayText: 'Salut Azure' });
    fetchWithRetryMock.mockResolvedValueOnce({});

    const { azureSpeechEngine } = await import('../src/integrations/stt/azure-speech.js');
    const result = await azureSpeechEngine.transcribe({
      filePath: './audio.wav',
      language: 'fr-FR',
      channels: 1,
      diarize: true,
      region: 'francecentral',
    });

    expect(requireEnvMock).toHaveBeenCalledWith('AZURE_SPEECH_KEY');
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1);
    expectUrlIncludes(0, 'language', 'fr-FR');
    expectUrlIncludes(0, 'diarizationEnabled', 'true');
    expect(result.text).toBe('Salut Azure');
  });
});
