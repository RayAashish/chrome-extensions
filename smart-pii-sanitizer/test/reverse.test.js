import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

test('Reverse Map - Longest Placeholder First (KEY_10 vs KEY_1)', () => {
  const vault = new Vault();

  // Populate vault with 10 keys so both REDACTED_KEY_1 and REDACTED_KEY_10 exist
  for (let i = 1; i <= 10; i++) {
    vault.getOrCreatePlaceholder(`real_secret_val_${i}`, 'KEY', 'SECRETS');
  }

  // AI response containing both KEY_1 and KEY_10
  const aiResponse = 'Config: keyA=REDACTED_KEY_1, keyB=REDACTED_KEY_10, verify=REDACTED_KEY_1';
  const { restoredText, restoredCount } = reverseMap(aiResponse, vault);

  assert.equal(restoredCount, 3);
  assert.ok(restoredText.includes('keyA=real_secret_val_1'), 'KEY_1 properly mapped');
  assert.ok(restoredText.includes('keyB=real_secret_val_10'), 'KEY_10 properly mapped without being clobbered by KEY_1');
  assert.ok(!restoredText.includes('real_secret_val_100'));
});

test('Reverse Map - Case-Insensitive AI Downcasing', () => {
  const vault = new Vault();
  vault.getOrCreatePlaceholder('mySecret12345', 'KEY', 'SECRETS'); // REDACTED_KEY_1

  // AI replies with lowercase redacted_key_1
  const aiResponse = 'You can pass redacted_key_1 in the Authorization header.';
  const { restoredText, restoredCount, details } = reverseMap(aiResponse, vault);

  assert.equal(restoredCount, 1);
  assert.ok(restoredText.includes('mySecret12345'));
  assert.ok(details[0].matchedFuzzy, 'Should be flagged as fuzzy/case match');
});

test('Reverse Map - Deformed Spacing Around Email', () => {
  const vault = new Vault();
  vault.getOrCreatePlaceholder('ceo@target.com', 'EMAIL', 'EMAIL'); // user_A@example.com

  // AI replies with spaces around the @ symbol
  const aiResponse = 'Notification sent to user_A @ example.com.';
  const { restoredText, restoredCount } = reverseMap(aiResponse, vault);

  assert.equal(restoredCount, 1);
  assert.ok(restoredText.includes('ceo@target.com'));
});

test('Reverse Map - Lingering Unmatched Placeholder Detection', () => {
  const vault = new Vault();
  vault.getOrCreatePlaceholder('alpha@test.com', 'EMAIL', 'EMAIL');

  // AI response has a placeholder that is NOT in the vault
  const aiResponse = 'Sent to user_A@example.com and REDACTED_KEY_999 from another session';
  const { restoredCount, unmatchedPlaceholders } = reverseMap(aiResponse, vault);

  assert.equal(restoredCount, 1);
  assert.ok(unmatchedPlaceholders.includes('REDACTED_KEY_999'), 'Surfaces unmatched placeholder warning');
});
