import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const DEFAULT_ENV_FILES = [
  '.env.local',
  '.env'
];

function loadFile(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return false;
  }

  dotenv.config({ path: absolutePath, override: true });
  return true;
}

export function loadEnvironment({ files = DEFAULT_ENV_FILES } = {}) {
  const loadedFiles = [];

  for (const file of files) {
    if (loadFile(file)) {
      loadedFiles.push(resolve(file));
    }
  }

  return loadedFiles;
}

export function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${key}`);
  }
  return value;
}

let cachedGoogleCredentials;

export function getGoogleCredentials() {
  if (cachedGoogleCredentials) {
    return cachedGoogleCredentials;
  }

  const credentialsPath = requireEnv('GOOGLE_APPLICATION_CREDENTIALS');
  const absolutePath = resolve(credentialsPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Fichier de credentials Google introuvable : ${absolutePath}`);
  }

  try {
    const raw = readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(raw);
    cachedGoogleCredentials = {
      path: absolutePath,
      data: parsed
    };
    return cachedGoogleCredentials;
  } catch (error) {
    throw new Error(`Impossible de charger les credentials Google : ${error.message}`);
  }
}

// Charge automatiquement les fichiers si ce module est importé directement
loadEnvironment();
