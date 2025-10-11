import { existsSync } from 'node:fs';
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

// Charge automatiquement les fichiers si ce module est importé directement
loadEnvironment();
