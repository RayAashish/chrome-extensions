import test from 'node:test';
import assert from 'node:assert/strict';
import { DETECTORS, isValidLuhn, generateDeterministicLuhnCard, calculateShannonEntropy } from '../core/detectors.js';

function getDetector(id) {
  const d = DETECTORS.find(item => item.id === id);
  if (!d) throw new Error(`Detector not found: ${id}`);
  return d;
}

test('Detectors - IPv4 vs Version Numbers & False Positives', () => {
  const ipv4Detector = getDetector('ipv4');

  // True Positives
  const validIps = 'Server at 192.168.1.50 and 10.244.0.1 and 172.16.254.1';
  const matches = ipv4Detector.scan(validIps);
  assert.equal(matches.length, 3, 'Should detect valid IPs');
  assert.equal(matches[0].rawValue, '192.168.1.50');
  assert.equal(matches[1].rawValue, '10.244.0.1');
  assert.equal(matches[2].rawValue, '172.16.254.1');

  // False Positives to Reject
  const versionsAndOids = 'release v1.2.3.4 or version: 2.10.4.1 or OID 1.3.6.1.4.1 or semver 0.1.2';
  const fpMatches = ipv4Detector.scan(versionsAndOids);
  assert.equal(fpMatches.length, 0, 'Should reject version numbers preceded by v/version');

  // Loopback and Wildcard filtered in balanced mode
  const loopback = 'localhost 127.0.0.1 and bind 0.0.0.0';
  assert.equal(ipv4Detector.scan(loopback, { sensitivity: 'balanced' }).length, 0);
  assert.equal(ipv4Detector.scan(loopback, { sensitivity: 'strict' }).length, 2);
});

test('Detectors - Phone Numbers vs Dates and Timestamps', () => {
  const phoneDetector = getDetector('phone_number');

  // True Positives
  const phones = 'Call +1-555-0199 or (555) 234-5678 or +44 20 7946 0958';
  const matches = phoneDetector.scan(phones);
  assert.ok(matches.length >= 2, 'Should detect valid phone numbers');

  // False Positives (Dates and Timestamps)
  const dateLog = 'Timestamp 2026-10-22 10:14:03 build-2024-11-05';
  const dateMatches = phoneDetector.scan(dateLog);
  assert.equal(dateMatches.length, 0, 'Dates and timestamps must never match as phone numbers');
});

test('Detectors - Credit Cards (Luhn Algorithm Validation)', () => {
  const ccDetector = getDetector('credit_card');

  // Valid Luhn generated cards
  for (let i = 0; i < 5; i++) {
    const card = generateDeterministicLuhnCard(i);
    assert.ok(isValidLuhn(card), `Generated card ${card} must be Luhn valid`);
    const matches = ccDetector.scan(`Paid with card ${card} today`);
    assert.equal(matches.length, 1, `Must detect card ${card}`);
  }

  // Invalid card (checksum modified)
  const invalidCard = '4111-1111-1111-1112'; // Checksum is wrong
  assert.equal(isValidLuhn(invalidCard), false, 'Modified card must fail Luhn check');
  assert.equal(ccDetector.scan(`Failed card ${invalidCard}`).length, 0, 'Invalid card must not match');
});

test('Detectors - Cloud & API Keys (Stripe, AWS, GitHub, Slack, Google)', () => {
  const stripe = getDetector('stripe_key');
  assert.equal(stripe.scan('sk_live_51H8xYzAbCdEfGhIjKlMnOpQr').length, 1);
  assert.equal(stripe.scan('pk_test_51H8xYzAbCdEfGhIjKlMnOpQr').length, 1);

  const aws = getDetector('aws_key');
  assert.equal(aws.scan('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE').length, 1);
  assert.equal(aws.scan('Not an AWS key: AKIA_SHORT').length, 0);

  const gh = getDetector('github_token');
  assert.equal(gh.scan('ghp_1234567890abcdefghijklmnopqrstuvwxyz').length, 1);
  assert.equal(gh.scan('github_pat_11A1B2C3D4_abcdefghijklmnopqrstuvwxyz0123456789012345678901234567890123456789012345').length, 1);

  const slack = getDetector('slack_token');
  assert.equal(slack.scan('xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx').length, 1);

  const google = getDetector('google_api_key');
  assert.equal(google.scan('AIzaSyD-1234567890abcdefghijklmnopqrstuv').length, 1);
});

test('Detectors - National IDs (SSN, PAN, Aadhaar)', () => {
  const ssn = getDetector('ssn');
  assert.equal(ssn.scan('SSN is 123-45-6789').length, 1);
  assert.equal(ssn.scan('Invalid SSN 000-12-3456').length, 0, 'SSN starting with 000 is invalid');
  assert.equal(ssn.scan('Invalid SSN 666-12-3456').length, 0, 'SSN 666 is invalid');

  const pan = getDetector('pan');
  assert.equal(pan.scan('PAN: ABCDE1234F').length, 1);
  assert.equal(pan.scan('Not a PAN: 12345ABCDE').length, 0);

  const aadhaar = getDetector('aadhaar');
  assert.equal(aadhaar.scan('Aadhaar: 9876 5432 1098').length, 1);
  assert.equal(aadhaar.scan('Invalid starting with 1: 1234 5678 9012').length, 0);
});

test('Detectors - JSON Web Token (JWT)', () => {
  const jwt = getDetector('jwt');
  const sampleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const matches = jwt.scan(`Authorization: Bearer ${sampleJwt}`);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].rawValue, sampleJwt);
});

test('Detectors - Shannon Entropy Calculation', () => {
  // Low entropy repetitive string
  const lowEntropy = calculateShannonEntropy('aaaaaaaaaaaa');
  assert.ok(lowEntropy < 0.1, 'Repetitive string must have near-zero entropy');

  // High entropy random token
  const highEntropy = calculateShannonEntropy('c7f8a92b1e4d093a8542c174b09e1f82');
  assert.ok(highEntropy > 3.4, 'Random hex string must have high entropy');
});
