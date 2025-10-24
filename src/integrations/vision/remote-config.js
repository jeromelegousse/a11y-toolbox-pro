import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import sodium from 'libsodium-wrappers';

const SECRETBOX_NONCEBYTES = 24;
const AES_GCM_IV_LENGTH = 12;
const AES_GCM_TAG_LENGTH = 16;
const AES_CBC_IV_LENGTH = 16;
const HMAC_LENGTH = 32;

let sodiumReadyPromise;

function ensureSodiumReady() {
  if (!sodiumReadyPromise) {
    sodiumReadyPromise = sodium.ready;
  }
  return sodiumReadyPromise;
}

function normalizeKey(key) {
  if (Buffer.isBuffer(key)) {
    return key;
  }
  if (typeof key === 'string' && key) {
    return Buffer.from(key, 'base64');
  }
  throw new Error('Clé de chiffrement LLaVA absente.');
}

async function decryptWithSodium(payload, key) {
  const data = sodium.from_base64(payload, sodium.base64_variants.ORIGINAL);
  if (!data || data.length <= SECRETBOX_NONCEBYTES) {
    return null;
  }

  const nonce = data.slice(0, SECRETBOX_NONCEBYTES);
  const ciphertext = data.slice(SECRETBOX_NONCEBYTES);
  try {
    await ensureSodiumReady();
    const message = sodium.crypto_secretbox_open_easy(
      ciphertext,
      nonce,
      Uint8Array.from(key)
    );
    return sodium.to_string(message);
  } catch (error) {
    return null;
  }
}

function decryptWithAesGcm(payload, key) {
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length <= AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH) {
    return null;
  }

  const iv = buffer.subarray(0, AES_GCM_IV_LENGTH);
  const tag = buffer.subarray(AES_GCM_IV_LENGTH, AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH);
  const ciphertext = buffer.subarray(AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return null;
  }
}

function decryptWithAesCbc(payload, key) {
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length <= AES_CBC_IV_LENGTH + HMAC_LENGTH) {
    return null;
  }

  const iv = buffer.subarray(0, AES_CBC_IV_LENGTH);
  const mac = buffer.subarray(AES_CBC_IV_LENGTH, AES_CBC_IV_LENGTH + HMAC_LENGTH);
  const ciphertext = buffer.subarray(AES_CBC_IV_LENGTH + HMAC_LENGTH);

  const calculatedMac = createHmac('sha256', key).update(ciphertext).digest();
  if (mac.length !== calculatedMac.length || !timingSafeEqual(mac, calculatedMac)) {
    return null;
  }

  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Déchiffre un secret chiffré côté WordPress.
 * @param {string} encrypted
 * @param {Buffer} key
 * @returns {Promise<string|null>}
 */
export async function decryptWordPressSecret(encrypted, key) {
  if (typeof encrypted !== 'string' || encrypted === '') {
    return '';
  }

  if (!Buffer.isBuffer(key) || key.length === 0) {
    throw new Error('Clé de chiffrement invalide.');
  }

  if (encrypted.startsWith('s:')) {
    return decryptWithSodium(encrypted.slice(2), key);
  }

  if (encrypted.startsWith('o1:')) {
    return decryptWithAesGcm(encrypted.slice(3), key);
  }

  if (encrypted.startsWith('o2:')) {
    return decryptWithAesCbc(encrypted.slice(3), key);
  }

  return encrypted;
}

/**
 * Retourne la configuration distante LLaVA fournie par WordPress.
 * @returns {Promise<{endpoint: string, token: string}|null>}
 */
export async function getLlavaRemoteConfig() {
  const endpoint = process.env.A11YTB_LLAVA_ENDPOINT?.trim();
  if (!endpoint) {
    return null;
  }

  const encryptedToken = process.env.A11YTB_LLAVA_TOKEN_ENCRYPTED?.trim();
  if (!encryptedToken) {
    throw new Error('Secret LLaVA absent pour le proxy distant.');
  }

  const keyBase64 = process.env.A11YTB_SECRET_KEY?.trim();
  if (!keyBase64) {
    throw new Error('Clé de chiffrement LLaVA manquante.');
  }

  const key = normalizeKey(keyBase64);
  if (key.length !== 32) {
    throw new Error('Clé de chiffrement LLaVA invalide.');
  }

  const token = await decryptWordPressSecret(encryptedToken, key);
  if (token === null || token === '') {
    throw new Error('Impossible de déchiffrer le secret LLaVA distant.');
  }

  return { endpoint, token };
}

export default getLlavaRemoteConfig;
