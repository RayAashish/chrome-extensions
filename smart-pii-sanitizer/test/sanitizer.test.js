import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, isAllowlisted, resolveOverlaps } from '../core/sanitizer.js';
import { Vault } from '../core/vault.js';

test('Sanitizer - Deterministic Replacement & Different Values Mapping', () => {
  const vault = new Vault();
  const input = 'First: user1@alpha.com, Second: user2@beta.com, Repeat: user1@alpha.com';
  const { sanitizedText, entities } = sanitize(input, { vault });

  assert.ok(sanitizedText.includes('user_A@example.com'), 'First email gets user_A');
  assert.ok(sanitizedText.includes('user_B@example.com'), 'Second email gets user_B');
  assert.equal(sanitizedText.match(/user_A@example\.com/g)?.length, 2, 'Repeat email gets user_A again');
  assert.equal(entities.length, 3);
});

test('Sanitizer - JSON Validity & Structure Preservation', () => {
  const originalJson = JSON.stringify({
    service: 'payment-gateway',
    user: {
      email: 'alice.smith@fintech.io',
      ip: '198.51.100.22',
      ssn: '123-45-6789'
    },
    auth: {
      token: 'sk_live_51H8xYzAbCdEfGhIjKlMnOpQr'
    },
    meta: {
      tags: ['production', 'pci-dss'],
      retries: 3
    }
  }, null, 2);

  const { sanitizedText } = sanitize(originalJson);

  // Sanitized text must still be 100% valid JSON
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(sanitizedText);
  }, 'Sanitized output must remain valid JSON');

  assert.equal(parsed.service, 'payment-gateway');
  assert.equal(parsed.user.email, 'user_A@example.com');
  assert.equal(parsed.user.ip, '10.0.0.1');
  assert.ok(parsed.user.ssn === 'REDACTED_SSN_1' || parsed.user.ssn === '000-12-0001');
  assert.equal(parsed.auth.token, 'REDACTED_KEY_1');
  assert.deepEqual(parsed.meta.tags, ['production', 'pci-dss']);
  assert.equal(parsed.meta.retries, 3);

  // When FORMAT_VALID is configured for SSN
  const resFmt = sanitize(originalJson, { placeholderStyles: { SSN: 'FORMAT_VALID' } });
  assert.equal(JSON.parse(resFmt.sanitizedText).user.ssn, '000-12-0001');
});

test('Sanitizer - Allowlist Filtering', () => {
  assert.ok(isAllowlisted('public.corp.com', ['public.corp.com']));
  assert.ok(isAllowlisted('dev@company.com', ['company.com']));
  assert.ok(isAllowlisted('api.example.com', ['*.example.com']));
  assert.ok(!isAllowlisted('secret@internal.net', ['company.com']));

  const input = 'Send to dev@company.com and ceo@private.org';
  const { sanitizedText } = sanitize(input, {
    allowlist: ['company.com']
  });

  assert.ok(sanitizedText.includes('dev@company.com'), 'Allowlisted email is not sanitized');
  assert.ok(sanitizedText.includes('user_A@example.com'), 'Non-allowlisted email is sanitized');
});

test('Sanitizer - Excluded Entity in Preview', () => {
  const input = 'Contact bob@test.com or alice@test.com';
  const initial = sanitize(input);

  // User decides to exclude first entity
  const firstEntityId = initial.entities[0].id;
  const { sanitizedText } = sanitize(input, {
    excludedEntityIds: [firstEntityId]
  });

  assert.ok(sanitizedText.includes('bob@test.com'), 'Excluded entity remains raw');
  assert.ok(sanitizedText.includes('user_A@example.com'), 'Other entity is sanitized');
});

test('Sanitizer - Overlap Resolution Priority', () => {
  // A DB URL contains credentials and host
  const rawDbUrl = 'postgres://admin:pass12345678@db.internal:5432/app';
  const { sanitizedText } = sanitize(`Connect via ${rawDbUrl}`);

  assert.ok(!sanitizedText.includes('pass12345678'), 'Password must be redacted');
  assert.ok(!sanitizedText.includes('db.internal'), 'Host must be redacted');
});
