import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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
      filename: 'sample.png'
    });
    expect(result.size).toBe(buffer.byteLength);
    expect(result.absolutePath).toContain('sample.png');
  });
});
