import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadImageAsBase64 } from '../../src/integrations/vision/utils.js';

const TEMP_DIRECTORIES = [];

afterAll(async () => {
  await Promise.all(TEMP_DIRECTORIES.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadImageAsBase64', () => {
  it('renvoie les métadonnées de base en encodant le fichier', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'vlm-test-'));
    TEMP_DIRECTORIES.push(baseDir);
    const filePath = join(baseDir, 'sample.png');
    const buffer = Buffer.from([0, 1, 2, 3]);
    await writeFile(filePath, buffer);

    const result = await loadImageAsBase64(filePath);

    expect(result).toMatchObject({
      mimeType: 'image/png',
      data: buffer.toString('base64'),
      filename: 'sample.png',
    });
    expect(result.size).toBe(buffer.byteLength);
    expect(result.absolutePath).toContain('sample.png');
  });

  it('télécharge une image distante puis réutilise le cache local', async () => {
    const originalFetch = globalThis.fetch;
    const remoteBuffer = Buffer.from([5, 6, 7, 8]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (key) => (key?.toLowerCase() === 'content-type' ? 'image/png' : null),
      },
      arrayBuffer: async () => remoteBuffer,
    }));
    globalThis.fetch = fetchMock;

    const remoteUrl = 'https://cdn.example.com/assets/photo';

    try {
      const first = await loadImageAsBase64(remoteUrl);
      TEMP_DIRECTORIES.push(dirname(first.absolutePath));

      expect(first.source).toBe('remote');
      expect(first.originalPath).toBe(remoteUrl);
      expect(first.data).toBe(remoteBuffer.toString('base64'));

      const second = await loadImageAsBase64(remoteUrl);
      expect(second.absolutePath).toBe(first.absolutePath);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
