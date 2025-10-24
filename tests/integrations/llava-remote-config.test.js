import { createCipheriv, randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const KEY = Buffer.alloc(32, 7);

function encryptWithAesGcm(key, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `o1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

describe('getLlavaRemoteConfig', () => {
  beforeEach(() => {
    delete process.env.A11YTB_LLAVA_ENDPOINT;
    delete process.env.A11YTB_LLAVA_TOKEN_ENCRYPTED;
    delete process.env.A11YTB_SECRET_KEY;
  });

  afterEach(() => {
    delete process.env.A11YTB_LLAVA_ENDPOINT;
    delete process.env.A11YTB_LLAVA_TOKEN_ENCRYPTED;
    delete process.env.A11YTB_SECRET_KEY;
  });

  it('retourne null lorsque le proxy distant est absent', async () => {
    const { getLlavaRemoteConfig } = await import('../../src/integrations/vision/remote-config.js');
    const result = await getLlavaRemoteConfig();
    expect(result).toBeNull();
  });

  it('décrypte le secret chiffré et expose la configuration', async () => {
    const { getLlavaRemoteConfig } = await import('../../src/integrations/vision/remote-config.js');

    process.env.A11YTB_LLAVA_ENDPOINT = 'https://proxy.example.test/vision';
    process.env.A11YTB_SECRET_KEY = KEY.toString('base64');
    process.env.A11YTB_LLAVA_TOKEN_ENCRYPTED = encryptWithAesGcm(KEY, 'token-demo');

    const config = await getLlavaRemoteConfig();
    expect(config).toEqual({ endpoint: 'https://proxy.example.test/vision', token: 'token-demo' });
  });

  it('décrypte un secret chiffré avec Sodium', async () => {
    await sodium.ready;
    const { decryptWordPressSecret } = await import('../../src/integrations/vision/remote-config.js');

    const nonce = sodium.randombytes_buf(24);
    const key = Uint8Array.from(KEY);
    const message = new Uint8Array(Buffer.from('secret-sodium', 'utf8'));
    const cipher = sodium.crypto_secretbox_easy(message, nonce, key);
    const payload = `s:${sodium.to_base64(new Uint8Array([...nonce, ...cipher]), sodium.base64_variants.ORIGINAL)}`;

    const decrypted = await decryptWordPressSecret(payload, KEY);
    expect(decrypted).toBe('secret-sodium');
  });
});
