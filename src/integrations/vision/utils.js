import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';

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

const EXTENSIONS_BY_MIME = new Map(
  [...MIME_TYPES.entries()].map(([extension, mimeType]) => [mimeType, extension])
);

const REMOTE_CACHE_PREFIX = 'a11y-vlm-';
let remoteCacheDirPromise;
const remoteDownloadPromises = new Map();
const remotePathCache = new Map();

function guessMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return MIME_TYPES.get(extension) ?? 'application/octet-stream';
}

function normaliseContentType(contentType) {
  return contentType?.split(';')?.[0]?.trim().toLowerCase() ?? null;
}

function guessExtensionFromContentType(contentType) {
  const normalised = normaliseContentType(contentType);
  return normalised ? EXTENSIONS_BY_MIME.get(normalised) ?? '' : '';
}

function guessExtensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    return extname(parsed.pathname).toLowerCase();
  } catch (error) {
    return '';
  }
}

function isHttpUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

async function ensureRemoteCacheDir() {
  if (!remoteCacheDirPromise) {
    remoteCacheDirPromise = mkdtemp(join(tmpdir(), REMOTE_CACHE_PREFIX));
  }

  return remoteCacheDirPromise;
}

async function downloadRemoteImage(imageUrl) {
  if (remotePathCache.has(imageUrl)) {
    return remotePathCache.get(imageUrl);
  }

  if (remoteDownloadPromises.has(imageUrl)) {
    return remoteDownloadPromises.get(imageUrl);
  }

  const downloadPromise = (async () => {
    const cacheDir = await ensureRemoteCacheDir();
    const hash = createHash('sha256').update(imageUrl).digest('hex');
    const extensionFromUrl = guessExtensionFromUrl(imageUrl);

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Échec du téléchargement de l'image distante (${response.status})`);
    }

    const contentType = response.headers?.get?.('content-type');
    const extensionFromContentType = guessExtensionFromContentType(contentType);
    const extension =
      (extensionFromUrl && MIME_TYPES.has(extensionFromUrl) && extensionFromUrl) ||
      extensionFromContentType ||
      '.bin';

    const filename = `${hash}${extension}`;
    const absolutePath = resolve(cacheDir, filename);

    try {
      await access(absolutePath);
      remotePathCache.set(imageUrl, absolutePath);
      return absolutePath;
    } catch (error) {
      // File does not exist yet – proceed with download.
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(absolutePath, buffer);
    remotePathCache.set(imageUrl, absolutePath);

    return absolutePath;
  })()
    .finally(() => {
      remoteDownloadPromises.delete(imageUrl);
    });

  remoteDownloadPromises.set(imageUrl, downloadPromise);
  return downloadPromise;
}

async function ensureLocalImagePath(input) {
  if (!input) {
    throw new Error("Le chemin de l'image est requis.");
  }

  if (isHttpUrl(input)) {
    const absolutePath = await downloadRemoteImage(input);
    return {
      absolutePath,
      originalPath: input,
      source: 'remote',
    };
  }

  const absolutePath = resolve(input);
  await access(absolutePath);

  return {
    absolutePath,
    originalPath: absolutePath,
    source: 'local',
  };
}

/**
 * Lit une image et la renvoie encodée en base64 avec ses métadonnées minimales.
 * @param {string} filePath
 * @returns {Promise<{ data: string, mimeType: string, size: number, filename: string, absolutePath: string, originalPath: string, source: 'local' | 'remote' }>}
 */
export async function loadImageAsBase64(filePath) {
  const { absolutePath, originalPath, source } = await ensureLocalImagePath(filePath);
  const buffer = await readFile(absolutePath);

  return {
    data: buffer.toString('base64'),
    mimeType: guessMimeType(absolutePath),
    size: buffer.byteLength,
    filename: basename(absolutePath),
    absolutePath,
    originalPath,
    source,
  };
}

export async function ensureLocalImage(filePath) {
  return ensureLocalImagePath(filePath);
}

export default loadImageAsBase64;
