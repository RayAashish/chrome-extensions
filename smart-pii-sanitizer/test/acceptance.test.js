import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

test('Acceptance Test (Section 5 Specification)', () => {
  const input = `2026-10-22 10:14:03 ERROR auth failed
user_email: “rahul.sharma@company.com”
ip: “192.168.1.45”
api_key: “sk_live_51H8xYzAbCdEfGhIjKlMnOpQr”
retry from rahul.sharma@company.com at 192.168.1.45`;

  const expectedSanitized = `2026-10-22 10:14:03 ERROR auth failed
user_email: “user_A@example.com”
ip: “10.0.0.1”
api_key: “REDACTED_KEY_1”
retry from user_A@example.com at 10.0.0.1`;

  const vault = new Vault();
  const { sanitizedText, entities, stats } = sanitize(input, { vault });

  assert.equal(sanitizedText, expectedSanitized, 'Sanitized output must match specification exactly');
  assert.equal(stats.total, 5, 'Found 5 entity occurrences (2 emails, 2 IPs, 1 API key)');

  // Test reverse mapping on an AI reply that uses the dummy values
  const aiReply = `Here is the corrected code for user_A@example.com connecting from 10.0.0.1 with key REDACTED_KEY_1:
curl -H "Authorization: Bearer REDACTED_KEY_1" https://api.service.com -d '{"user":"user_A@example.com"}'`;

  const { restoredText, restoredCount } = reverseMap(aiReply, vault);

  assert.equal(restoredCount, 5, 'Must restore all 5 placeholder instances');
  assert.ok(restoredText.includes('rahul.sharma@company.com'), 'Email restored');
  assert.ok(restoredText.includes('192.168.1.45'), 'IP restored');
  assert.ok(restoredText.includes('sk_live_51H8xYzAbCdEfGhIjKlMnOpQr'), 'API key restored');
  assert.ok(!restoredText.includes('user_A@example.com'), 'Placeholder user_A replaced');
  assert.ok(!restoredText.includes('10.0.0.1'), 'Placeholder 10.0.0.1 replaced');
  assert.ok(!restoredText.includes('REDACTED_KEY_1'), 'Placeholder REDACTED_KEY_1 replaced');
});
