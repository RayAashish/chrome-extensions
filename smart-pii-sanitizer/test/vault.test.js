import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault } from '../core/vault.js';
import { encryptVault, decryptVault } from '../core/crypto.js';

test('Vault - Bidirectional Mapping & Counters', () => {
  const vault = new Vault();
  const email = 'developer@company.com';
  const p1 = vault.getOrCreatePlaceholder(email, 'EMAIL', 'EMAIL');

  assert.equal(p1, 'user_A@example.com');
  assert.equal(vault.getRealValue(p1), email);
  assert.equal(vault.getOrCreatePlaceholder(email, 'EMAIL', 'EMAIL'), p1, 'Idempotent mapping');

  // Deletion
  const deleted = vault.deleteEntry(p1);
  assert.equal(deleted, true);
  assert.equal(vault.getRealValue(p1), null);
});

test('Vault - Serialization (toJSON / fromJSON)', () => {
  const vaultA = new Vault();
  vaultA.getOrCreatePlaceholder('secret-token-12345', 'KEY', 'SECRETS');
  vaultA.getOrCreatePlaceholder('admin@corp.internal', 'EMAIL', 'EMAIL');

  const json = vaultA.toJSON();
  const vaultB = new Vault();
  vaultB.fromJSON(json);

  assert.equal(vaultB.getRealValue('REDACTED_KEY_1'), 'secret-token-12345');
  assert.equal(vaultB.getRealValue('user_A@example.com'), 'admin@corp.internal');
  assert.equal(vaultB.counters.KEY, 2);
});

test('Vault - Auto Expiry', () => {
  const vault = new Vault({ autoExpireMinutes: 10 });
  vault.getOrCreatePlaceholder('temp@val.com', 'EMAIL', 'EMAIL');

  assert.equal(vault.isExpired(), false);

  // Artificially shift lastActivity to 11 minutes ago
  vault.lastActivity = Date.now() - (11 * 60 * 1000);
  assert.equal(vault.isExpired(), true);

  // Accessing real value clears expired entries
  assert.equal(vault.getRealValue('user_A@example.com'), null);
});

test('Vault - Web Crypto AES-GCM Encryption & Decryption', async () => {
  const vault = new Vault();
  vault.getOrCreatePlaceholder('super-secret-master-token', 'KEY', 'SECRETS');
  const payload = vault.toJSON();

  const passphrase = 'CorrectBatteryHorseStaple!2026';

  // Encrypt
  const encrypted = await encryptVault(payload, passphrase);
  assert.ok(encrypted.ciphertext, 'Has ciphertext');
  assert.ok(encrypted.salt, 'Has salt');
  assert.ok(encrypted.iv, 'Has iv');
  assert.ok(!encrypted.ciphertext.includes('super-secret-master-token'), 'Plaintext must not be present');

  // Decrypt with correct passphrase
  const decrypted = await decryptVault(encrypted, passphrase);
  assert.equal(decrypted.entries[0].realValue, 'super-secret-master-token');

  // Decrypt with incorrect passphrase must fail
  await assert.rejects(
    async () => {
      await decryptVault(encrypted, 'WrongPassphrase123');
    },
    /Decryption failed/,
    'Decryption with wrong password must throw'
  );
});
