import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  computeHmac,
  generateStripeSignature,
  generateGitHubSignature,
  generateShopifySignature,
  generateGenericSignature
} from '../webhooks/signatures.js';

describe('Webhook Signature Generators (Web Crypto API)', () => {
  const testSecret = 'whsec_test_secret_key_12345';
  const testPayload = JSON.stringify({ event: 'test.ping', amount: 1000 });

  it('should compute exact HMAC-SHA256 hex matching standard Node.js crypto', async () => {
    const webCryptoHex = await computeHmac(testSecret, testPayload, 'SHA-256', 'hex');

    // Reference calculation using Node crypto
    const nodeCryptoHex = crypto
      .createHmac('sha256', testSecret)
      .update(testPayload)
      .digest('hex');

    assert.strictEqual(webCryptoHex, nodeCryptoHex);
  });

  it('should compute exact HMAC-SHA256 base64 matching standard Node.js crypto', async () => {
    const webCryptoB64 = await computeHmac(testSecret, testPayload, 'SHA-256', 'base64');

    const nodeCryptoB64 = crypto
      .createHmac('sha256', testSecret)
      .update(testPayload)
      .digest('base64');

    assert.strictEqual(webCryptoB64, nodeCryptoB64);
  });

  it('should generate valid Stripe-Signature matching Stripe specification', async () => {
    const fixedTimestamp = 1700000000;
    const result = await generateStripeSignature(testPayload, testSecret, fixedTimestamp);

    assert.strictEqual(result.headerName, 'Stripe-Signature');
    assert.strictEqual(result.timestamp, fixedTimestamp);

    // Verify format t={timestamp},v1={hash}
    assert(/^t=1700000000,v1=[a-f0-9]{64}$/.test(result.headerValue));

    // Verify signature math: hmac_sha256(secret, "t=1700000000." + payload)
    const expectedHash = crypto
      .createHmac('sha256', testSecret)
      .update(`t=${fixedTimestamp}.${testPayload}`)
      .digest('hex');

    assert.strictEqual(result.headerValue, `t=${fixedTimestamp},v1=${expectedHash}`);
  });

  it('should generate valid GitHub X-Hub-Signature-256 matching GitHub specification', async () => {
    const result = await generateGitHubSignature(testPayload, testSecret);

    assert.strictEqual(result.headerName, 'X-Hub-Signature-256');
    assert(/^sha256=[a-f0-9]{64}$/.test(result.headerValue));

    const expectedHash = crypto
      .createHmac('sha256', testSecret)
      .update(testPayload)
      .digest('hex');

    assert.strictEqual(result.headerValue, `sha256=${expectedHash}`);
  });

  it('should generate valid Shopify X-Shopify-Hmac-Sha256 base64 signature', async () => {
    const result = await generateShopifySignature(testPayload, testSecret);

    assert.strictEqual(result.headerName, 'X-Shopify-Hmac-Sha256');

    const expectedBase64 = crypto
      .createHmac('sha256', testSecret)
      .update(testPayload)
      .digest('base64');

    assert.strictEqual(result.headerValue, expectedBase64);
  });

  it('should generate valid generic HMAC signature with custom header name', async () => {
    const result = await generateGenericSignature(testPayload, testSecret, 'X-Custom-Webhook-Sig', 'hex');

    assert.strictEqual(result.headerName, 'X-Custom-Webhook-Sig');
    assert(/^[a-f0-9]{64}$/.test(result.headerValue));
  });
});
