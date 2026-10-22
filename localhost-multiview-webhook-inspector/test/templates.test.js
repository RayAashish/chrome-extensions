import { describe, it } from 'node:test';
import assert from 'node:assert';
import { substituteTemplateVariables } from '../shared/utils.js';
import { WEBHOOK_TEMPLATES, getTemplateById } from '../webhooks/templates.js';

describe('Webhook Templates & Dynamic Variable Substitution', () => {
  it('should substitute {{timestamp}} with current unix timestamp in seconds', () => {
    const raw = '{"time": {{timestamp}}}';
    const result = substituteTemplateVariables(raw);
    const parsed = JSON.parse(result);

    assert(typeof parsed.time === 'number');
    assert(parsed.time > 1700000000);
  });

  it('should substitute {{iso_timestamp}} with valid ISO-8601 string', () => {
    const raw = '{"created_at": "{{iso_timestamp}}"}';
    const result = substituteTemplateVariables(raw);
    const parsed = JSON.parse(result);

    assert(!isNaN(Date.parse(parsed.created_at)));
  });

  it('should substitute {{uuid}} with valid RFC4122 v4 UUID format', () => {
    const raw = '{"eventId": "{{uuid}}"}';
    const result = substituteTemplateVariables(raw);
    const parsed = JSON.parse(result);

    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.eventId));
  });

  it('should substitute {{random_int}} with random 5-digit integer', () => {
    const raw = '{"orderId": {{random_int}}}';
    const result = substituteTemplateVariables(raw);
    const parsed = JSON.parse(result);

    assert(parsed.orderId >= 1000 && parsed.orderId <= 99999);
  });

  it('should substitute {{random_email}} with localhost test email', () => {
    const raw = '{"email": "{{random_email}}"}';
    const result = substituteTemplateVariables(raw);
    const parsed = JSON.parse(result);

    assert(parsed.email.endsWith('@example.localhost'));
  });

  it('should load all built-in templates and produce valid JSON after variable substitution', () => {
    assert(WEBHOOK_TEMPLATES.length >= 8);

    WEBHOOK_TEMPLATES.forEach(tpl => {
      assert(tpl.id, 'Template missing ID');
      assert(tpl.name, 'Template missing Name');
      assert(tpl.method, 'Template missing Method');

      if (tpl.defaultHeaders['Content-Type'] === 'application/json') {
        const evaluated = substituteTemplateVariables(tpl.body);
        assert.doesNotThrow(() => JSON.parse(evaluated), `Template ${tpl.id} did not produce valid JSON`);
      }
    });
  });
});
