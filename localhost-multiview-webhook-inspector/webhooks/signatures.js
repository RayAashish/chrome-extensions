/**
 * Webhook Cryptographic Signature Generators
 * Uses only Web Crypto API (crypto.subtle) to generate valid HMAC signatures
 * for Stripe, GitHub, Shopify, and generic endpoints.
 */

/**
 * Converts a string to Uint8Array UTF-8 buffer
 */
function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Converts an ArrayBuffer to hex string
 */
function bufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  const hexCodes = [];
  for (let i = 0; i < byteArray.length; i++) {
    const value = byteArray[i];
    const hex = value.toString(16).padStart(2, '0');
    hexCodes.push(hex);
  }
  return hexCodes.join('');
}

/**
 * Converts an ArrayBuffer to base64 string
 */
function bufferToBase64(buffer) {
  const byteArray = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < byteArray.byteLength; i++) {
    binary += String.fromCharCode(byteArray[i]);
  }
  return btoa(binary);
}

/**
 * Generic HMAC calculator using Web Crypto API
 */
export async function computeHmac(secret, message, algorithm = 'SHA-256', outputEncoding = 'hex') {
  if (typeof secret !== 'string') secret = String(secret || '');
  if (typeof message !== 'string') message = String(message || '');

  const keyBuffer = stringToBuffer(secret);
  const msgBuffer = stringToBuffer(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);

  if (outputEncoding === 'base64') {
    return bufferToBase64(signatureBuffer);
  }
  return bufferToHex(signatureBuffer);
}

/**
 * Stripe Signature Generator
 * Scheme: t={timestamp},v1={hmac_sha256(secret, t={timestamp}.{payload})}
 * Header: Stripe-Signature
 */
export async function generateStripeSignature(payload, secret, customTimestamp = null) {
  const timestamp = customTimestamp !== null ? customTimestamp : Math.floor(Date.now() / 1000);
  const signedPayload = `t=${timestamp}.${payload}`;
  const hmacHex = await computeHmac(secret, signedPayload, 'SHA-256', 'hex');

  return {
    headerName: 'Stripe-Signature',
    headerValue: `t=${timestamp},v1=${hmacHex}`,
    timestamp,
    signature: hmacHex
  };
}

/**
 * GitHub Signature Generator
 * Scheme: sha256={hmac_sha256(secret, payload)}
 * Header: X-Hub-Signature-256
 */
export async function generateGitHubSignature(payload, secret) {
  const hmacHex = await computeHmac(secret, payload, 'SHA-256', 'hex');

  return {
    headerName: 'X-Hub-Signature-256',
    headerValue: `sha256=${hmacHex}`,
    signature: hmacHex
  };
}

/**
 * Shopify Signature Generator
 * Scheme: base64(hmac_sha256(secret, payload))
 * Header: X-Shopify-Hmac-Sha256
 */
export async function generateShopifySignature(payload, secret) {
  const hmacBase64 = await computeHmac(secret, payload, 'SHA-256', 'base64');

  return {
    headerName: 'X-Shopify-Hmac-Sha256',
    headerValue: hmacBase64,
    signature: hmacBase64
  };
}

/**
 * Generic HMAC Signature Generator
 */
export async function generateGenericSignature(payload, secret, headerName = 'X-Signature-SHA256', encoding = 'hex') {
  const signature = await computeHmac(secret, payload, 'SHA-256', encoding);

  return {
    headerName: headerName.trim() || 'X-Signature-SHA256',
    headerValue: signature,
    signature
  };
}
