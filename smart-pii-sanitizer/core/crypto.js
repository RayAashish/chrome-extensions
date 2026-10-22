/**
 * Smart PII Sanitizer - Cryptographic Vault Storage
 * Uses Web Crypto API (PBKDF2 + AES-GCM 256-bit).
 * Fully compatible with Chrome MV3 runtime and modern Node.js environments.
 */

// Use global crypto or node:crypto fallback
const subtle = typeof crypto !== 'undefined' && crypto.subtle 
  ? crypto.subtle 
  : (await import('node:crypto')).webcrypto.subtle;

const getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues
  ? crypto.getRandomValues.bind(crypto)
  : (await import('node:crypto')).webcrypto.getRandomValues.bind((await import('node:crypto')).webcrypto);

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

/**
 * Convert an ArrayBuffer or Uint8Array to a Base64 string.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a Base64 string to a Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derive an AES-GCM CryptoKey from a user passphrase and salt.
 * @param {string} passphrase 
 * @param {Uint8Array} salt 
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const passwordKey = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary JSON-serializable data using AES-GCM with a user passphrase.
 * @param {any} data 
 * @param {string} passphrase 
 * @returns {Promise<{ ciphertext: string, salt: string, iv: string, version: number }>}
 */
export async function encryptVault(data, passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Encryption passphrase must be a non-empty string');
  }

  const salt = getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(data));

  const cipherBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    plaintextBytes
  );

  return {
    ciphertext: bufferToBase64(cipherBuffer),
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    version: 1
  };
}

/**
 * Decrypt a vault payload using a user passphrase.
 * @param {{ ciphertext: string, salt: string, iv: string, version?: number }} encryptedEnvelope 
 * @param {string} passphrase 
 * @returns {Promise<any>}
 */
export async function decryptVault(encryptedEnvelope, passphrase) {
  if (!encryptedEnvelope || !encryptedEnvelope.ciphertext || !encryptedEnvelope.salt || !encryptedEnvelope.iv) {
    throw new Error('Invalid encrypted envelope format');
  }
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Decryption passphrase must be a non-empty string');
  }

  const salt = base64ToUint8Array(encryptedEnvelope.salt);
  const iv = base64ToUint8Array(encryptedEnvelope.iv);
  const ciphertextBytes = base64ToUint8Array(encryptedEnvelope.ciphertext);

  const key = await deriveKey(passphrase, salt);

  try {
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      ciphertextBytes
    );

    const dec = new TextDecoder();
    const jsonString = dec.decode(decryptedBuffer);
    return JSON.parse(jsonString);
  } catch {
    throw new Error('Decryption failed: Incorrect passphrase or corrupted vault data');
  }
}
