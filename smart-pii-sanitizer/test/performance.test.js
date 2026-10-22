import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

test('Edge Cases - Empty Input & Null Handling', () => {
  assert.equal(sanitize('').sanitizedText, '');
  assert.equal(sanitize(null).sanitizedText, '');
  assert.equal(sanitize(undefined).sanitizedText, '');

  assert.equal(reverseMap('', new Vault()).restoredText, '');
  assert.equal(reverseMap(null, new Vault()).restoredText, '');
});

test('Edge Cases - Unicode, Emoji, and Multilingual Characters', () => {
  const input = `🚀 Deployment Alert! 
User: “rajesh.kumar@mumbai.co.in” 
Address: 192.168.10.15 
Token: sk_live_51H8xYzAbCdEfGhIjKlMnOpQr 
Status: ✅ OK 🎉 
日本語テキスト: 田中太郎
Arabic text: مرحبا بالعالم`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(sanitizedText.includes('🚀 Deployment Alert!'));
  assert.ok(sanitizedText.includes('“user_A@example.com”'));
  assert.ok(sanitizedText.includes('10.0.0.1'));
  assert.ok(sanitizedText.includes('REDACTED_KEY_1'));
  assert.ok(sanitizedText.includes('Status: ✅ OK 🎉'));
  assert.ok(sanitizedText.includes('日本語テキスト: 田中太郎'));
  assert.ok(sanitizedText.includes('Arabic text: مرحبا بالعالم'));

  const { restoredText } = reverseMap(sanitizedText, vault);
  assert.equal(restoredText, input, 'Exact round-trip with unicode and emoji');
});

test('Performance - 1 MB Input Benchmark (< 300 ms)', () => {
  // Generate realistic 1 MB text buffer with interleaved emails, IPs, and log statements
  const logTemplate = `2026-10-22 10:14:03.123 [main] INFO com.example.service.UserService - Request from user_john_doe_999@internal-corp.org at 192.168.10.45 with token sk_live_51H8xYzAbCdEfGhIjKlMnOpQr processed in 42ms\n`;
  const repeatCount = Math.ceil(1024 * 1024 / logTemplate.length);
  const oneMegabyteText = logTemplate.repeat(repeatCount);

  assert.ok(oneMegabyteText.length >= 1024 * 1024, 'Text is at least 1 MB');

  const start = performance.now();
  const { sanitizedText, stats } = sanitize(oneMegabyteText);
  const durationMs = performance.now() - start;

  assert.ok(durationMs < 300, `Sanitization took ${durationMs.toFixed(2)}ms, must be < 300ms`);
  assert.ok(stats.total > 0, 'Found entities in 1 MB payload');
  assert.ok(sanitizedText.length > 0);
});

test('Performance - 5 MB Large Payload Stability', () => {
  const line = 'Processing batch transaction id=998811 from client 172.16.0.4 with email billing-lead@company.net\n';
  const repeatCount = Math.ceil((5 * 1024 * 1024) / line.length);
  const fiveMegabyteText = line.repeat(repeatCount);

  assert.ok(fiveMegabyteText.length >= 5 * 1024 * 1024, 'Text is at least 5 MB');

  const start = performance.now();
  const { sanitizedText, stats } = sanitize(fiveMegabyteText);
  const durationMs = performance.now() - start;

  assert.ok(stats.total > 0);
  assert.ok(sanitizedText.length > 0);
  assert.ok(durationMs < 2000, `5 MB scan completed in ${durationMs.toFixed(2)}ms without memory overflow`);
});

test('Performance - 10,000 Lines of Code Benchmark (< 600 ms)', () => {
  const lines = [];
  for (let i = 0; i < 10000; i++) {
    if (i % 4 === 0) {
      lines.push(`const user_${i} = { email: "engineer_${i}@internal.corp", ip: "10.0.1.${i % 250}", key: "sk_live_${'A'.repeat(24)}${i}" };`);
    } else if (i % 4 === 1) {
      lines.push(`function processWorker${i}() { const secret = "superPass_${i}!"; return secret; }`);
    } else {
      lines.push(`  // Logging step ${i}: benign code with numbers 123456 and strings "hello world"`);
    }
  }
  const text = lines.join('\n');
  assert.equal((text.match(/\n/g) || []).length, 9999, '10,000 lines');

  const vault = new Vault();
  const start = performance.now();
  const result = sanitize(text, { vault });
  const durationMs = performance.now() - start;

  assert.ok(durationMs < 600, `10k lines sanitized in ${durationMs.toFixed(2)}ms (must be < 600ms)`);
  assert.ok(result.entities.length > 0, 'Found sensitive entities');
  assert.equal((result.sanitizedText.match(/\n/g) || []).length, 9999, 'Line count strictly preserved');

  // Reverse map test on the 10k line output
  const t0 = performance.now();
  const rev = reverseMap(result.sanitizedText, vault);
  const revMs = performance.now() - t0;
  assert.ok(revMs < 1000, `10k lines reverse mapped in ${revMs.toFixed(2)}ms`);
  assert.equal(rev.restoredText, text, 'Round trip preserves exact 10,000 lines byte-for-byte');
});

test('Performance - 100,000 Lines of Code Stability (No Hang / No Freeze)', () => {
  const lines = [];
  for (let i = 0; i < 100000; i++) {
    if (i % 10 === 0) {
      lines.push(`const config_${i} = { api_key: "ghp_${'B'.repeat(30)}${i % 500}", host: "db-${i % 20}.example.internal" };`);
    } else {
      lines.push(`  const value_${i} = computeHash(${i}, "benchmark-data"); // line index ${i}`);
    }
  }
  const largeCode = lines.join('\n');
  assert.ok(largeCode.length > 7000000, 'Over 7 MB and 100,000 lines');

  const start = performance.now();
  const result = sanitize(largeCode);
  const durationMs = performance.now() - start;

  assert.ok(durationMs < 5000, `100,000 lines completed in ${durationMs.toFixed(2)}ms without freezing`);
  assert.ok(result.stats.total > 0, 'Successfully sanitized 100k lines');
  assert.equal((result.sanitizedText.match(/\n/g) || []).length, 99999, '100,000 lines preserved');
});
