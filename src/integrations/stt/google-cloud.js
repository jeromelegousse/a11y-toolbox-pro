import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { fetchWithRetry, parseJson } from '../http-client.js';
import { getGoogleCredentials } from '../../../scripts/integrations/env.js';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_SPEECH_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize';
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_ENCODING = 'LINEAR16';
const DEFAULT_SAMPLE_RATE = 16000;

function ensureFilePath(filePath) {
  if (!filePath) {
    throw new Error('Le paramètre "filePath" est obligatoire pour la transcription.');
  }
  return resolve(filePath);
}

async function readAudio(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(`Impossible de lire le fichier audio : ${error.message}`);
  }
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

async function createAccessToken(credentials) {
  const { client_email: clientEmail, private_key: privateKey } = credentials;
  if (!clientEmail || !privateKey) {
    throw new Error('Les credentials Google doivent contenir client_email et private_key.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: GOOGLE_TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${base64url(header)}.${base64url(claims)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetchWithRetry(
    GOOGLE_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }),
      timeout: 15000
    },
    {
      retries: 1,
      retryDelayMs: 1000
    }
  );

  const payload = await parseJson(response);
  if (!payload?.access_token) {
    throw new Error('Impossible d\'obtenir un access token Google.');
  }

  return payload.access_token;
}

export const googleCloudSttEngine = {
  id: 'google-cloud-stt',
  /**
   * @param {{ filePath: string, language?: string, channels?: number, diarize?: boolean, sampleRate?: number, encoding?: string }} options
   */
  async transcribe({ filePath, language = DEFAULT_LANGUAGE, channels, diarize, sampleRate = DEFAULT_SAMPLE_RATE, encoding = DEFAULT_ENCODING } = {}) {
    const absolutePath = ensureFilePath(filePath);
    const { data: credentials } = getGoogleCredentials();
    const audioBuffer = await readAudio(absolutePath);
    const accessToken = await createAccessToken(credentials);

    let diarizationConfig;
    if (typeof diarize === 'boolean') {
      diarizationConfig = { enableSpeakerDiarization: diarize };
      if (diarize) {
        diarizationConfig.minSpeakerCount = 2;
        if (typeof channels === 'number') {
          diarizationConfig.maxSpeakerCount = Math.max(2, channels);
        }
      }
    }

    const config = {
      encoding,
      languageCode: language,
      enableAutomaticPunctuation: true,
      sampleRateHertz: sampleRate
    };

    if (typeof channels === 'number') {
      config.audioChannelCount = channels;
    }
    if (diarizationConfig) {
      config.diarizationConfig = diarizationConfig;
    }

    const body = {
      config,
      audio: {
        content: audioBuffer.toString('base64')
      }
    };

    const response = await fetchWithRetry(
      GOOGLE_SPEECH_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        timeout: 45000
      },
      {
        retries: 1,
        retryDelayMs: 1000
      }
    );

    const payload = await parseJson(response);
    const transcript = payload?.results?.flatMap((result) => result.alternatives ?? [])?.map((alt) => alt.transcript)?.join(' ').trim();

    if (!transcript) {
      throw new Error('La réponse Google Cloud Speech-to-Text ne contient pas de transcription.');
    }

    return {
      text: transcript,
      raw: payload
    };
  }
};

export default googleCloudSttEngine;
