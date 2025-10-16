import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
]);

function guessMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return MIME_TYPES.get(extension) ?? 'application/octet-stream';
}

/**
 * Lit une image et la renvoie encodée en base64 avec ses métadonnées minimales.
 * @param {string} filePath
 * @returns {Promise<{ data: string, mimeType: string, size: number, filename: string, absolutePath: string }>}
 */
export async function loadImageAsBase64(filePath) {
  if (!filePath) {
    throw new Error("Le chemin de l'image est requis.");
  }

  const absolutePath = resolve(filePath);
  const buffer = await readFile(absolutePath);

  return {
    data: buffer.toString('base64'),
    mimeType: guessMimeType(absolutePath),
    size: buffer.byteLength,
    filename: basename(absolutePath),
    absolutePath,
  };
}

export default loadImageAsBase64;
