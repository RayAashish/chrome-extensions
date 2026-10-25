/**
 * Smart PII Sanitizer - Test Suite for LLM Reply Mutations & Assisted Mapping (Section 5 Spec)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vault } from '../core/vault.js';
import { sanitize, buildLlmInstructionHeader } from '../core/sanitizer.js';
import {
  reverseMap,
  inferCategoryFromToken,
  detectUnrecognizedRedactionTokens,
  stripLlmInstructionHeader
} from '../core/reverse.js';

test('1. Sanitize 4 original lines with default TAG Aadhaar and round-trip', () => {
  const input = `password = Milkhasing@123\nip = 192.168.1.1\npan = HONET6085M\naadhar = 5832 9661 7644`;
  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(sanitizedText.includes('password = REDACTED_KEY_1'), 'password -> REDACTED_KEY_1');
  assert.ok(sanitizedText.includes('ip = 10.0.0.1'), 'ip -> 10.0.0.1');
  assert.ok(sanitizedText.includes('pan = AAAAA1000A'), 'pan -> format-valid PAN placeholder');
  assert.ok(sanitizedText.includes('aadhar = REDACTED_AADHAAR_1'), 'aadhar -> REDACTED_AADHAAR_1 (TAG style default)');

  // Assert keys, '=', and spacing preserved
  assert.ok(sanitizedText.startsWith('password = REDACTED_KEY_1\nip = 10.0.0.1\npan = AAAAA1000A\naadhar = REDACTED_AADHAAR_1'));

  // Round trip
  const rev = reverseMap(sanitizedText, vault);
  assert.equal(rev.restoredText, input, 'Byte-for-byte round trip');
  assert.equal(rev.restoredCount, 4);
});

test('2. Fixture ai-reply-happy.txt: 100-line log restores all Aadhaar, password, IP and PAN', () => {
  const fixturePath = path.resolve('fixtures/ai-reply-happy.txt');
  const happyText = fs.readFileSync(fixturePath, 'utf8');

  const vault = new Vault();
  vault.getOrCreatePlaceholder('Milkhasing@123', 'KEY', 'SECRETS');
  vault.getOrCreatePlaceholder('192.168.1.1', 'IPV4', 'NETWORK');
  vault.getOrCreatePlaceholder('HONET6085M', 'PAN', 'ID_CARDS');
  vault.getOrCreatePlaceholder('5832 9661 7644', 'AADHAAR', 'ID_CARDS');

  const rev = reverseMap(happyText, vault);
  assert.ok(rev.restoredCount >= 60, `Restored ${rev.restoredCount} items across all contexts`);
  assert.ok(!rev.restoredText.includes('REDACTED_AADHAAR_1'), 'No placeholder left in text');
  assert.ok(rev.restoredText.includes('5832 9661 7644'), 'Real Aadhaar restored in all contexts');
  assert.ok(rev.restoredText.includes('Milkhasing@123'), 'Real password restored in all contexts');
  assert.ok(rev.restoredText.includes('192.168.1.1'), 'Real IP restored in all contexts');
  assert.ok(rev.restoredText.includes('HONET6085M'), 'Real PAN restored in all contexts');

  assert.equal(rev.healthCheck.missingCount, 0, 'Zero missing placeholders');
  assert.equal(rev.healthCheck.unrecognizedCount, 0, 'Zero unrecognized tokens');
  assert.equal(rev.healthCheck.status, 'green');
});

test('3. Fixture ai-reply-mutated.txt: health strip, unrecognized list, popover assisted mapping, aliases, and clear vault', () => {
  const fixturePath = path.resolve('fixtures/ai-reply-mutated.txt');
  const mutatedText = fs.readFileSync(fixturePath, 'utf8');

  const vault = new Vault();
  vault.getOrCreatePlaceholder('Milkhasing@123', 'KEY', 'SECRETS');
  vault.getOrCreatePlaceholder('192.168.1.1', 'IPV4', 'NETWORK');
  vault.getOrCreatePlaceholder('HONET6085M', 'PAN', 'ID_CARDS');
  vault.getOrCreatePlaceholder('5832 9661 7644', 'AADHAAR', 'ID_CARDS');

  // 1. Initial Reverse Map run on mutated reply
  const rev1 = reverseMap(mutatedText, vault);
  assert.equal(rev1.healthCheck.issuedCount, 4);
  assert.equal(rev1.healthCheck.foundCount, 3);
  assert.equal(rev1.healthCheck.missingCount, 1);
  assert.equal(rev1.healthCheck.missing[0].placeholder, 'REDACTED_AADHAAR_1');
  assert.equal(rev1.healthCheck.unrecognizedCount, 1);
  assert.equal(rev1.healthCheck.unrecognized[0].token, '[REDACTED_AADHAAR_MOCK]');
  assert.equal(rev1.healthCheck.unrecognized[0].count, 21);
  assert.equal(rev1.healthCheck.status, 'amber');

  // Popover infers category aadhaar
  const inferred = inferCategoryFromToken(rev1.healthCheck.unrecognized[0].token);
  assert.equal(inferred, 'AADHAAR');

  // With 1 Aadhaar entry in vault: offers one-click restore
  const aadhaarCandidates1 = vault.getAllEntries().filter(e => e.type === 'AADHAAR');
  assert.equal(aadhaarCandidates1.length, 1);

  // With 2 Aadhaar entries in vault: requires explicit choice
  vault.getOrCreatePlaceholder('9876 5432 1098', 'AADHAAR', 'ID_CARDS');
  const aadhaarCandidates2 = vault.getAllEntries().filter(e => e.type === 'AADHAAR');
  assert.equal(aadhaarCandidates2.length, 2);

  // User confirms mapping [REDACTED_AADHAAR_MOCK] -> REDACTED_AADHAAR_1
  vault.addAlias('[REDACTED_AADHAAR_MOCK]', 'REDACTED_AADHAAR_1');

  // Re-run reverse map with confirmed alias
  const rev2 = reverseMap(mutatedText, vault);
  assert.ok(!rev2.restoredText.includes('[REDACTED_AADHAAR_MOCK]'), 'All [REDACTED_AADHAAR_MOCK] tags replaced');
  const matchAadhaar = rev2.restoredText.match(/5832 9661 7644/g);
  assert.equal(matchAadhaar.length, 21, 'All 21 occurrences become 5832 9661 7644');
  assert.equal(rev2.healthCheck.missingCount, 1); // REDACTED_AADHAAR_2 is still missing, but REDACTED_AADHAAR_1 is resolved
  assert.equal(rev2.healthCheck.unrecognizedCount, 0, 'Zero unrecognized tokens after mapping');

  // Alias session memory: second reply with the same mutated token auto-restores
  const secondReply = 'New verification worker logged aadhar = [REDACTED_AADHAAR_MOCK] successfully.';
  const rev3 = reverseMap(secondReply, vault);
  assert.ok(rev3.restoredText.includes('aadhar = 5832 9661 7644'), 'Auto-restored in second reply via alias memory');

  // Clear vault removes alias and entries
  vault.clear();
  assert.equal(vault.getAliases().length, 0, 'Clear vault removes all aliases');
  assert.equal(vault.getAllEntries().length, 0, 'Clear vault removes all entries');
});

test('4. Tolerant matching of issued placeholders & KEY_1 vs KEY_10 ordering', () => {
  const vault = new Vault();
  for (let i = 1; i <= 9; i++) {
    vault.getOrCreatePlaceholder(`SECRET_${i}`, 'KEY', 'SECRETS');
  }
  const key10Real = 'SECRET_TEN_SUPER_LONG';
  vault.getOrCreatePlaceholder(key10Real, 'KEY', 'SECRETS'); // REDACTED_KEY_10
  vault.getOrCreatePlaceholder('alice@work.com', 'EMAIL', 'EMAIL');

  const testInput = [
    'Bracketed: [REDACTED_KEY_1]',
    'Angle: <REDACTED_KEY_1>',
    'Downcased: redacted_key_1',
    'Escaped underscore: REDACTED\\_KEY\\_1',
    'Space separated: REDACTED KEY 1',
    'Markdown bold: **REDACTED_KEY_1**',
    'Trailing period: REDACTED_KEY_1.',
    'Escaped email possessive: user\\_A@example.com\'s',
    'Ordering check: REDACTED_KEY_10 followed by REDACTED_KEY_1'
  ].join('\n');

  const rev = reverseMap(testInput, vault);
  assert.ok(rev.restoredText.includes('Bracketed: SECRET_1'));
  assert.ok(rev.restoredText.includes('Angle: SECRET_1'));
  assert.ok(rev.restoredText.includes('Downcased: SECRET_1'));
  assert.ok(rev.restoredText.includes('Escaped underscore: SECRET_1'));
  assert.ok(rev.restoredText.includes('Space separated: SECRET_1'));
  assert.ok(rev.restoredText.includes('Markdown bold: **SECRET_1**'));
  assert.ok(rev.restoredText.includes('Trailing period: SECRET_1.'));
  assert.ok(rev.restoredText.includes("alice@work.com's"));
  assert.ok(rev.restoredText.includes(key10Real));
  assert.ok(!rev.restoredText.includes('SECRET_10'), 'Longest-first ordering prevents KEY_1 truncating KEY_10');

  // Ambiguous fuzzy cases must NOT auto-restore
  const ambiguous = 'REDACTED_KEY_ and REDACTED_ and completely benign';
  const revAmbiguous = reverseMap(ambiguous, vault);
  assert.equal(revAmbiguous.restoredCount, 0, 'Ambiguous fuzzy cases must not auto-restore');
});

test('5. Unrecognized-token detection for redaction patterns and no false alarms for normal text', () => {
  const vault = new Vault();
  vault.getOrCreatePlaceholder('dummy', 'KEY', 'SECRETS');

  const aiOutput = `
    Line 1: Status is [MASKED].
    Line 2: Token was <REDACTED>.
    Line 3: Identity was {{AADHAAR_NUMBER}}.
    Line 4: Masked card: XXXX XXXX 7644.
    Line 5: Security event: [PII_REMOVED].
  `;

  const tokens = detectUnrecognizedRedactionTokens(aiOutput, vault);
  const tokenNames = tokens.map(t => t.token);

  assert.ok(tokenNames.includes('[MASKED]'));
  assert.ok(tokenNames.includes('<REDACTED>'));
  assert.ok(tokenNames.includes('{{AADHAAR_NUMBER}}'));
  assert.ok(tokenNames.includes('XXXX XXXX 7644'));
  assert.ok(tokenNames.includes('[PII_REMOVED]'));

  const partialMask = tokens.find(t => t.token === 'XXXX XXXX 7644');
  assert.ok(partialMask.isPartialMask, 'Identified as partial mask');

  // Verify that partial mask is reported but not auto-restored
  const rev = reverseMap(aiOutput, vault);
  assert.ok(rev.restoredText.includes('XXXX XXXX 7644'), 'Partial mask is not auto-restored without explicit confirmation');

  // Benign normal text has ZERO false alarms
  const normalText = `
    The quick brown fox jumps over the lazy dog.
    Build completed with status: SUCCESS in 42 seconds.
    HTTP 200 OK. Content-Type: application/json.
    function calculateTotal(price, taxRate) { return price * (1 + taxRate); }
  `;
  const normalTokens = detectUnrecognizedRedactionTokens(normalText, vault);
  assert.equal(normalTokens.length, 0, 'No false alarms on benign normal text');
});

test('6. LLM instruction header: prepended on copy, stripped by Reverse Map, and example tokens not counted as findings', () => {
  const input = `password = Milkhasing@123\nip = 192.168.1.1\naadhar = 5832 9661 7644`;
  const vault = new Vault();
  const { sanitizedText, entities } = sanitize(input, { vault });

  const header = buildLlmInstructionHeader(entities);
  assert.ok(header.startsWith('Note: tokens like'));
  assert.ok(header.includes('REDACTED_KEY_1'));
  assert.ok(header.includes('10.0.0.1'));
  assert.ok(header.includes('REDACTED_AADHAAR_1'));

  // Prepend to text as if copied with toggle ON
  const textWithHeader = `${header}\n\n${sanitizedText}`;

  // Reverse map strips the header
  const rev = reverseMap(textWithHeader, vault);
  assert.ok(!rev.restoredText.includes('Note: tokens like'), 'Instruction header stripped');
  assert.equal(rev.restoredText.trim(), input.trim(), 'Restored text matches original without header');
  assert.equal(rev.healthCheck.missingCount, 0);
  assert.equal(rev.healthCheck.unrecognizedCount, 0);
});

test('7. Idempotency and collision tests with TAG placeholders', () => {
  const vault = new Vault();
  const input = `password = REDACTED_KEY_1\naadhar = REDACTED_AADHAAR_1`;

  // Sanitizing already-sanitized text is a no-op
  const { sanitizedText, entities } = sanitize(input, { vault });
  assert.equal(sanitizedText, input, 'Sanitizing already-sanitized text is a no-op');
  assert.equal(entities.length, 0, 'No double redaction');

  // Collision policy: if user literally entered REDACTED_AADHAAR_1, vault does not issue it for real PII
  const vault2 = new Vault();
  const realAadhaarInput = `User typed REDACTED_AADHAAR_1 literally, but here is real: aadhar = 5832 9661 7644`;
  const res = sanitize(realAadhaarInput, { vault: vault2 });
  // Vault skips REDACTED_AADHAAR_1 and issues REDACTED_AADHAAR_2
  assert.ok(res.sanitizedText.includes('aadhar = REDACTED_AADHAAR_2'), 'Issues collision-free REDACTED_AADHAAR_2');
});

test('8. Property tests over all fixtures: round trip, invariant line count, zero residual findings', () => {
  const happyPath = path.resolve('fixtures/ai-reply-happy.txt');
  const happyText = fs.readFileSync(happyPath, 'utf8');

  const vault = new Vault();
  const sanitized = sanitize(happyText, { vault });

  // Line count invariant
  const origLineCount = (happyText.match(/\n/g) || []).length;
  const sanLineCount = (sanitized.sanitizedText.match(/\n/g) || []).length;
  assert.equal(sanLineCount, origLineCount, 'Line count invariant strictly preserved');

  // Residual findings scan on sanitized text reports 0 findings
  assert.equal(sanitized.residualFindings.length, 0, 'Zero residual findings on sanitized output');

  // Reverse Map round trip
  const rev = reverseMap(sanitized.sanitizedText, vault);
  assert.equal(rev.restoredText, happyText, 'Byte-for-byte round trip on fixture');
});
