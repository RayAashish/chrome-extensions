import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildCssPath,
  buildElementLocator,
  resolveElementLocator
} from '../shared/locator.js';

describe('Locator Generator & Resolver', () => {
  it('should extract data-testid when present as highest precedence locator', () => {
    // Simulated DOM element mock
    const mockEl = {
      nodeType: 1,
      tagName: 'BUTTON',
      getAttribute(attr) {
        if (attr === 'data-testid') return 'submit-signup-btn';
        if (attr === 'role') return 'button';
        return null;
      },
      id: 'dynamic-button-9428',
      innerText: 'Submit Registration'
    };

    const loc = buildElementLocator(mockEl);
    assert.strictEqual(loc.testId, 'submit-signup-btn');
    assert.strictEqual(loc.tagName, 'button');
    assert.strictEqual(loc.summary, 'submit-signup-btn');
  });

  it('should ignore dynamic/generated numeric IDs in favor of aria-label or name', () => {
    const mockEl = {
      nodeType: 1,
      tagName: 'INPUT',
      getAttribute(attr) {
        if (attr === 'name') return 'user_email';
        if (attr === 'placeholder') return 'Enter your email';
        return null;
      },
      id: '12345_generated_hash',
      innerText: ''
    };

    const loc = buildElementLocator(mockEl);
    assert.strictEqual(loc.id, null, 'Generated numeric ID should be rejected');
    assert.strictEqual(loc.name, 'user_email');
    assert.strictEqual(loc.placeholder, 'Enter your email');
  });

  it('should resolve element by testId in mock document', () => {
    const targetElement = {
      id: 'btn-1',
      getAttribute: () => 'nav-settings-link',
      isConnected: true,
      getClientRects: () => [{ width: 100, height: 30 }],
      getBoundingClientRect: () => ({ width: 100, height: 30 })
    };

    // Mock document
    const mockDoc = {
      querySelector(selector) {
        if (selector === '[data-testid="nav-settings-link"]') {
          return targetElement;
        }
        return null;
      }
    };

    // Global mock for getComputedStyle
    globalThis.window = {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };

    const result = resolveElementLocator({ testId: 'nav-settings-link', summary: 'nav-settings-link' }, mockDoc);
    assert.strictEqual(result.status, 'found');
    assert.strictEqual(result.matchedBy, 'testId');
    assert.strictEqual(result.element, targetElement);
  });

  it('should flag elements that exist in DOM but are hidden in current viewport', () => {
    const hiddenElement = {
      id: 'settings-nav',
      isConnected: true,
      getClientRects: () => [], // Hidden: zero client rects
      getBoundingClientRect: () => ({ width: 0, height: 0 })
    };

    const mockDoc = {
      querySelector: () => null,
      getElementById: (id) => id === 'settings-nav' ? hiddenElement : null
    };

    globalThis.window = {
      getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' })
    };

    const result = resolveElementLocator({ id: 'settings-nav', summary: '#settings-nav' }, mockDoc);
    assert.strictEqual(result.status, 'hidden');
    assert.strictEqual(result.matchedBy, 'id');
    assert(result.reason.includes('hidden in this viewport'));
  });

  it('should return not_found when element does not exist in target DOM', () => {
    const mockDoc = {
      querySelector: () => null,
      getElementById: () => null
    };

    const result = resolveElementLocator({ testId: 'missing-button', summary: 'missing-button' }, mockDoc);
    assert.strictEqual(result.status, 'not_found');
    assert.strictEqual(result.element, null);
  });
});
