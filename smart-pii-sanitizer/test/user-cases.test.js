import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

test('CASE 1: Secrets keyed by variable name are detected (FAIL in current code)', () => {
  const input = `api=asiuhfasuhd423l!
password = Raysi@2002
api_key asodoji23
client_secret: "s3cr3tValue"
"auth_token":"abc123xyz"
export DB_PASS='p@ss w0rd'`;

  const vault = new Vault();
  const { sanitizedText, stats } = sanitize(input, { vault });

  assert.ok(!sanitizedText.includes('asiuhfasuhd423l!'), 'api value must be redacted');
  assert.ok(!sanitizedText.includes('Raysi@2002'), 'password value must be redacted');
  assert.ok(!sanitizedText.includes('asodoji23'), 'api_key value must be redacted');
  assert.ok(!sanitizedText.includes('s3cr3tValue'), 'client_secret value must be redacted');
  assert.ok(!sanitizedText.includes('abc123xyz'), 'auth_token value must be redacted');
  assert.ok(!sanitizedText.includes('p@ss w0rd'), 'DB_PASS value must be redacted');

  // Verify structure preservation (keys, separators, quotes, export)
  assert.ok(sanitizedText.includes('api='), 'api= preserved');
  assert.ok(sanitizedText.includes('password = '), 'password = preserved');
  assert.ok(sanitizedText.includes('api_key '), 'api_key separator preserved');
  assert.ok(sanitizedText.includes('client_secret: "'), 'client_secret quotes preserved');
  assert.ok(sanitizedText.includes('"auth_token":"'), '"auth_token": quotes preserved');
  assert.ok(sanitizedText.includes("export DB_PASS='"), "export DB_PASS=' preserved");
});

test('CASE 2: Email whitespace/structure preservation (PASS regression test)', () => {
  const input = `email=a@b.com
email = a@b.com
	email:    a@b.com`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  const lines = sanitizedText.split('\n');
  assert.equal(lines.length, 3, 'Must have 3 lines');
  assert.ok(lines[0].startsWith('email='), 'Line 0 has no space');
  assert.ok(lines[1].startsWith('email = '), 'Line 1 has spaces');
  assert.ok(lines[2].startsWith('\temail:    '), 'Line 2 has tab and spaces');
  // All three emails must share the same placeholder
  const placeholder = lines[0].replace('email=', '');
  assert.equal(lines[1], `email = ${placeholder}`);
  assert.equal(lines[2], `\temail:    ${placeholder}`);
});

test('CASE 3: JSON payload: tokens array and Indian phone redacted (FAIL in current code)', () => {
  const input = `{"user":{"email":"rahul@acme.io","backup":"rahul@acme.io","tokens":["ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789","eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"]},"ip":"192.168.1.45","note":"call +91 98765 43210"}`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  // Must remain valid JSON
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(sanitizedText);
  }, 'Sanitized output must be valid JSON');

  assert.ok(!sanitizedText.includes('rahul@acme.io'), 'Email redacted');
  assert.ok(!sanitizedText.includes('ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'), 'GitHub token redacted');
  assert.ok(!sanitizedText.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT redacted');
  assert.ok(!sanitizedText.includes('192.168.1.45'), 'IP redacted');
  assert.ok(!sanitizedText.includes('98765 43210'), 'Indian phone redacted');
  assert.equal(parsed.user.email, parsed.user.backup, 'Both emails share same placeholder');
});

test('CASE 4: Credentials inside URLs and connection strings (FAIL in current code)', () => {
  const input = `postgres://admin:S3cr3t!@10.2.3.4:5432/orders
https://user:pass@internal.corp.net/api?email=a@b.com&token=abc123
mongodb+srv://dbuser:p%40ss@cluster0.mongodb.net/test`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  const lines = sanitizedText.split('\n');
  assert.ok(!sanitizedText.includes('S3cr3t!'), 'Postgres password redacted');
  assert.ok(!sanitizedText.includes('admin'), 'Postgres user redacted');
  assert.ok(!sanitizedText.includes('10.2.3.4'), 'Host IP redacted');
  assert.ok(lines[0].includes(':5432/orders'), 'Port and path preserved in line 1');

  assert.ok(!sanitizedText.includes('user:pass'), 'HTTP basic auth user:pass redacted');
  assert.ok(!sanitizedText.includes('pass@internal.corp.net'), 'Userinfo must not be treated as email');
  assert.ok(!sanitizedText.includes('internal.corp.net'), 'Internal host redacted');
  assert.ok(sanitizedText.includes('token='), 'Query param token preserved');
  assert.ok(!sanitizedText.includes('token=abc123'), 'Query token value redacted');

  assert.ok(sanitizedText.includes('mongodb+srv://'), 'mongodb+srv scheme preserved byte-for-byte');
  assert.ok(!lines[2].includes(':5432'), 'Port must NOT be invented in line 3');
  assert.ok(!sanitizedText.includes('p%40ss'), 'Percent-encoded password redacted');
});

test('CASE 5: Username inside file paths redacted (FAIL in current code)', () => {
  const input = `2026-10-22T10:14:03Z ERROR [req-8f3a] Auth failed for rahul.sharma@company.com from 192.168.1.45
	at com.acme.Auth.login(Auth.java:88)
Caused by: java.io.FileNotFoundException: /Users/rahul/projects/acme/.env
X-Forwarded-For: 203.0.113.9, 10.0.0.7`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(!sanitizedText.includes('/Users/rahul/'), 'Username rahul inside /Users/rahul/ must be redacted');
  assert.ok(sanitizedText.includes('/Users/'), 'Path prefix /Users/ preserved');
  assert.ok(sanitizedText.includes('/projects/acme/.env'), 'Project path preserved');
  assert.ok(sanitizedText.includes('Auth.java:88'), 'Stack trace location untouched');
  assert.ok(sanitizedText.includes('2026-10-22T10:14:03Z'), 'Timestamp untouched');
  assert.ok(sanitizedText.includes('[req-8f3a]'), 'Request ID untouched');
});

test('CASE 6: PEM markers preserved and typed placeholders (PASS/ENHANCE)', () => {
  const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
AKIAIOSFODNN7EXAMPLE
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(sanitizedText.includes('-----BEGIN RSA PRIVATE KEY-----'), 'BEGIN marker preserved');
  assert.ok(sanitizedText.includes('-----END RSA PRIVATE KEY-----'), 'END marker preserved');
  assert.ok(sanitizedText.includes('REDACTED_AWS_KEY_') || sanitizedText.includes('REDACTED_KEY_'), 'AWS key redacted');
});

test('CASE 7: Indian identifiers, phone numbers, and UPI (FAIL in current code)', () => {
  const input = `Aadhaar: 2345 6789 0123
PAN ABCDE1234F, GSTIN 29ABCDE1234F1Z5, IFSC HDFC0001234
UPI: rahul@okhdfcbank, 9876543210@ybl
Phone: +91 98765 43210 / 09876543210 / 98765-43210`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  // Aadhaar format preservation: must keep spaces, not force dashes
  assert.ok(!sanitizedText.includes('2345 6789 0123'), 'Aadhaar redacted');
  const aadhaarMatch = sanitizedText.match(/Aadhaar:\s*(\d{4}\s\d{4}\s\d{4})/);
  assert.ok(aadhaarMatch, 'Aadhaar must preserve 4-4-4 space formatting');

  // PAN and GSTIN
  assert.ok(!sanitizedText.includes('ABCDE1234F'), 'PAN must be redacted');
  assert.ok(!sanitizedText.includes('29ABCDE1234F1Z5'), 'GSTIN must embed the redacted PAN');

  // UPI
  assert.ok(!sanitizedText.includes('rahul@okhdfcbank'), 'UPI handle rahul must be redacted');
  assert.ok(!sanitizedText.includes('+1-555'), 'Indian UPI and phones must not have +1-555 glued in');

  // Phone numbers: all 3 share same number
  assert.ok(!sanitizedText.includes('98765 43210'), 'Phone with space redacted');
  assert.ok(!sanitizedText.includes('09876543210'), 'Phone with 0 redacted');
  assert.ok(!sanitizedText.includes('98765-43210'), 'Phone with dash redacted');
});

test('CASE 8: Benign data not corrupted by false positives (FAIL in current code)', () => {
  const input = `version 1.2.3.4, build 2026.10.22
order 1729584000 created at epoch 1729584000
uuid 550e8400-e29b-41d4-a716-446655440000
lat 12.9716, lng 77.5946
RRN 429512345678 (12-digit bank reference)`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(sanitizedText.includes('uuid 550e8400-e29b-41d4-a716-446655440000'), 'UUID must be completely untouched');
  assert.ok(sanitizedText.includes('version 1.2.3.4'), 'Version string untouched');
  assert.ok(sanitizedText.includes('build 2026.10.22'), 'Build date untouched');
  assert.ok(sanitizedText.includes('order 1729584000'), 'Epoch untouched');
  assert.ok(sanitizedText.includes('lat 12.9716, lng 77.5946'), 'Lat/long untouched');
  assert.ok(sanitizedText.includes('RRN 429512345678'), '12-digit RRN untouched unless in Aadhaar context');
});

test('CASE 9: IPv6 full match & MAC address detection (FAIL in current code)', () => {
  const input = `192.168.1.45:8080
10.0.0.0/24
2001:0db8:85a3::8a2e:0370:7334
::1 and 127.0.0.1
999.1.1.1
00:1B:44:11:3A:B7`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(!sanitizedText.includes('2001:0db8:85a3::8a2e:0370:7334'), 'IPv6 redacted');
  assert.ok(!sanitizedText.includes('8a2e:0370:7334'), 'IPv6 must not leave dangling tail');
  assert.ok(!sanitizedText.includes('00:1B:44:11:3A:B7'), 'MAC address redacted');
  assert.ok(sanitizedText.includes('::1 and 127.0.0.1'), 'Loopbacks untouched in balanced mode');
  assert.ok(sanitizedText.includes('999.1.1.1'), 'Invalid IP untouched');
});

test('CASE 11: Internationalized email and escaped text (FAIL in current code)', () => {
  const input = `नाम: राहुल, email: rahul@कंपनी.भारत
emoji 🙂 user: rahul@acme.io 🙂
zero\\u200Bwidth@acme.io
{"msg":"line1\\nrahul@acme.io\\tnext"}`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(!sanitizedText.includes('rahul@कंपनी.भारत'), 'IDN email must be redacted');
  assert.ok(!sanitizedText.includes('zero\\user_'), 'Escaped character must not be corrupted into zero\\user_');
  assert.ok(sanitizedText.includes('line1\\n'), 'JSON \\n escape preserved');
  assert.ok(sanitizedText.includes('\\tnext'), 'JSON \\t escape preserved');
});

test('CASE 13: Shell, SQL and code contexts (FAIL in current code)', () => {
  const input = `curl -u admin:hunter2 -H "Authorization: Basic YWRtaW46aHVudGVyMg==" https://api.acme.io
DB_PASSWORD="p@ss word"
INSERT INTO users VALUES ('rahul','rahul@acme.io','9876543210');
const key = "sk_live_51H8xYzAbCdEfGhIjKlMnOpQr";`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });

  assert.ok(!sanitizedText.includes('admin:hunter2'), 'curl -u credentials redacted');
  assert.ok(!sanitizedText.includes('YWRtaW46aHVudGVyMg=='), 'Basic auth base64 redacted');
  assert.ok(!sanitizedText.includes('p@ss word'), 'DB_PASSWORD redacted');
  assert.ok(!sanitizedText.includes('sk_live_51H8xYzAbCdEfGhIjKlMnOpQr'), 'Stripe key redacted');
  assert.ok(!sanitizedText.includes('9876543210'), 'Phone in SQL row redacted');
});

test('CASE 10: Placeholder collision policy is consistent', () => {
  const vault = new Vault();
  // Literal text in input contains 10.0.0.1. The generator must skip 10.0.0.1 when assigning IP placeholder!
  const input1 = '10.0.0.1 is here and private IP is 192.168.1.50';
  const res1 = sanitize(input1, { vault });
  assert.ok(!res1.sanitizedText.includes('192.168.1.50'), 'IP must be sanitized');

  // Idempotent re-sanitization when input contains already-issued placeholder
  const alreadySanitized = res1.sanitizedText;
  const res2 = sanitize(alreadySanitized, { vault });
  assert.ok(res2.stats.hasExistingPlaceholders, 'Must detect existing placeholder in input');
  assert.equal(res2.sanitizedText, alreadySanitized, 'Existing placeholders must remain unchanged (idempotent)');

  // Round trip restores exact original input
  const restored = reverseMap(res2.sanitizedText, vault);
  assert.equal(restored.restoredText, input1, 'Round trip restores original input');
});

test('CASE 12: Missing data / stale output & residual scan', () => {
  const input = `email=rahul@acme.io
phone=+91 98765 43210
api=asiuhfasuhd423l!
password=Raysi@2002
api_key asodoji23`;

  const { sanitizedText, residualFindings } = sanitize(input);
  const inputLines = input.split('\n');
  const outputLines = sanitizedText.split('\n');

  assert.equal(outputLines.length, inputLines.length, 'Line count must be preserved byte-for-byte');
  assert.equal(outputLines[4].startsWith('api_key '), true, '5th line must never be dropped');
  assert.equal(residualFindings.length, 0, 'Residual scan must be clean for properly sanitized output');
});

test('CASE 14: Reverse Map round trip, markdown code blocks, possessives, and unmatched reporting', () => {
  const input = `User: "rahul@acme.io" (contact: rahul@acme.io's account)
\`\`\`json
{
  "key": "sk_live_51H8xYzAbCdEfGhIjKlMnOpQr"
}
\`\`\`
Server: 192.168.1.45`;

  const vault = new Vault();
  const { sanitizedText } = sanitize(input, { vault });
  const { restoredText, stats } = reverseMap(sanitizedText, vault);

  assert.equal(restoredText, input, 'Exact byte-for-byte round trip');
  assert.ok(stats.restoredCount >= 2, 'Restored all placeholders');

  // Unmatched reporting
  const aiReplyWithFakePlaceholder = `Hello, I processed REDACTED_KEY_9999 for user_ZZ@example.com`;
  const unmatchRes = reverseMap(aiReplyWithFakePlaceholder, vault);
  assert.ok(unmatchRes.unmatchedPlaceholders.length > 0, 'Unissued placeholders reported as unmatched');
});
