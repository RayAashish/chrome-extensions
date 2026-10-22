import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

const FIXTURES = [
  'spring-boot.log',
  'kubernetes.log',
  'api-payload.json',
  'email-thread.txt',
  'database-dump.sql',
  'env-file.env'
];

test('Fixtures - Sanitize and Reverse Map Real-world Samples', () => {
  for (const filename of FIXTURES) {
    const filePath = join(process.cwd(), 'fixtures', filename);
    const rawContent = readFileSync(filePath, 'utf8');

    const vault = new Vault();
    const { sanitizedText, entities, stats } = sanitize(rawContent, { vault });

    assert.ok(stats.total > 0, `Fixture ${filename} must detect sensitive entities`);
    assert.ok(sanitizedText.length > 0);

    // If it was JSON, ensure output remains valid JSON
    if (filename.endsWith('.json')) {
      assert.doesNotThrow(() => JSON.parse(sanitizedText), 'Sanitized JSON fixture must remain valid JSON');
    }

    // Reverse map must successfully restore original content
    const { restoredText, restoredCount } = reverseMap(sanitizedText, vault);
    assert.equal(restoredCount, stats.total, `All detected entities must be restored in ${filename}`);
    assert.equal(restoredText, rawContent, `Restored text must exactly match raw fixture ${filename}`);
  }
});
