/**
 * Robust DOM Locator Generator & Resolver
 * Enables cross-viewport element synchronization across different responsive DOM structures.
 */

// Safe CSS.escape wrapper for both Browser and Node.js environments
const safeCssEscape = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
  ? CSS.escape
  : (str) => String(str).replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');

/**
 * Checks if an ID looks like a dynamic/generated hash or GUID
 */
function isDynamicId(id) {
  if (!id || typeof id !== 'string') return true;
  if (/^[0-9]/.test(id)) return true; // Starts with digit
  if (/^[a-f0-9-]{32,}$/i.test(id)) return true; // UUID or long hash
  if (/^(:r[0-9a-z]+:)/.test(id)) return true; // React 18 useId pattern (:r1:, :r2:)
  if (/^__/.test(id)) return true; // Internal identifiers
  return false;
}

/**
 * Extracts clean, normalized text snippet from an element
 */
function getNormalizedTextSnippet(el, maxLength = 40) {
  if (!el) return null;
  const text = el.innerText || el.textContent || '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

/**
 * Builds a deterministic, structural CSS path for an element
 */
export function buildCssPath(element) {
  if (!element || element.nodeType !== 1) return '';

  const path = [];
  let current = element;

  while (current && current.nodeType === 1 && current.tagName && current.tagName.toLowerCase() !== 'html') {
    const tagName = current.tagName.toLowerCase();

    // If element has a reliable ID, stop traversal early
    if (current.id && !isDynamicId(current.id)) {
      path.unshift(`#${safeCssEscape(current.id)}`);
      break;
    }

    // Determine sibling index
    let siblingIndex = 1;
    let sibling = current.previousElementSibling;
    let hasSiblingsWithSameTag = false;

    while (sibling) {
      if (sibling.tagName && sibling.tagName.toLowerCase() === tagName) {
        siblingIndex++;
        hasSiblingsWithSameTag = true;
      }
      sibling = sibling.previousElementSibling;
    }

    let nextSibling = current.nextElementSibling;
    while (nextSibling) {
      if (nextSibling.tagName && nextSibling.tagName.toLowerCase() === tagName) {
        hasSiblingsWithSameTag = true;
        break;
      }
      nextSibling = nextSibling.nextElementSibling;
    }

    if (hasSiblingsWithSameTag) {
      path.unshift(`${tagName}:nth-of-type(${siblingIndex})`);
    } else {
      path.unshift(tagName);
    }

    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * Builds a structural XPath for an element
 */
export function buildXPath(element) {
  if (!element || element.nodeType !== 1) return '';
  if (element.id && !isDynamicId(element.id)) {
    return `//*[@id="${element.id}"]`;
  }

  const paths = [];
  let current = element;

  while (current && current.nodeType === 1) {
    let index = 0;
    let sibling = current.previousSibling;
    const currentName = current.nodeName || current.tagName || '';
    while (sibling) {
      const sibName = sibling.nodeName || sibling.tagName || '';
      if (sibling.nodeType === 1 && sibName === currentName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = currentName.toLowerCase();
    const pathIndex = index > 0 ? `[${index + 1}]` : '[1]';
    paths.unshift(tagName + pathIndex);

    current = current.parentNode;
  }

  return '/' + paths.join('/');
}

/**
 * Generates a comprehensive composite locator object for a target element
 */
export function buildElementLocator(element) {
  if (!element || element.nodeType !== 1) {
    return null;
  }

  const testId = (typeof element.getAttribute === 'function' && (
                 element.getAttribute('data-testid') ||
                 element.getAttribute('data-test-id') ||
                 element.getAttribute('data-cy') ||
                 element.getAttribute('data-qa'))) ||
                 null;

  const rawId = element.id && !isDynamicId(element.id) ? element.id : null;
  const name = (typeof element.getAttribute === 'function' && element.getAttribute('name')) || null;
  const ariaLabel = (typeof element.getAttribute === 'function' && element.getAttribute('aria-label')) || null;
  const role = (typeof element.getAttribute === 'function' && element.getAttribute('role')) || (element.tagName ? element.tagName.toLowerCase() : '');
  const placeholder = (typeof element.getAttribute === 'function' && element.getAttribute('placeholder')) || null;
  const textSnippet = getNormalizedTextSnippet(element, 40);
  const cssPath = buildCssPath(element);
  const xpath = buildXPath(element);

  return {
    tagName: element.tagName ? element.tagName.toLowerCase() : '',
    testId,
    id: rawId,
    name,
    ariaLabel,
    role,
    placeholder,
    textSnippet,
    cssPath,
    xpath,
    summary: testId || rawId || ariaLabel || name || textSnippet || cssPath
  };
}

/**
 * Checks if an element is visibly rendered in the current document viewport
 */
export function isElementVisible(element) {
  if (!element || !element.isConnected) return false;

  const rects = typeof element.getClientRects === 'function' ? element.getClientRects() : [];
  if (!rects || rects.length === 0) return false;

  const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { width: 0, height: 0 };
  if (rect.width <= 0 && rect.height <= 0) return false;

  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
  }

  return true;
}

/**
 * Resolves a composite locator in the target document
 * Returns the matching element and visibility diagnostics
 */
export function resolveElementLocator(locator, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!locator || typeof locator !== 'object' || !doc) {
    return { element: null, status: 'not_found', matchedBy: null, reason: 'Invalid locator object or document' };
  }

  let element = null;
  let matchedBy = null;

  // 1. Try test ID (most resilient across all responsive layouts)
  if (locator.testId) {
    const testSelectors = [
      `[data-testid="${safeCssEscape(locator.testId)}"]`,
      `[data-test-id="${safeCssEscape(locator.testId)}"]`,
      `[data-cy="${safeCssEscape(locator.testId)}"]`,
      `[data-qa="${safeCssEscape(locator.testId)}"]`
    ];
    for (const sel of testSelectors) {
      try {
        const found = doc.querySelector(sel);
        if (found) {
          element = found;
          matchedBy = 'testId';
          break;
        }
      } catch {
        // Continue
      }
    }
  }

  // 2. Try reliable ID
  if (!element && locator.id) {
    try {
      const found = doc.getElementById(locator.id);
      if (found) {
        element = found;
        matchedBy = 'id';
      }
    } catch {
      // Continue
    }
  }

  // 3. Try name attribute (for forms)
  if (!element && locator.name) {
    try {
      const found = doc.querySelector(`[name="${safeCssEscape(locator.name)}"]`);
      if (found) {
        element = found;
        matchedBy = 'name';
      }
    } catch {
      // Continue
    }
  }

  // 4. Try aria-label
  if (!element && locator.ariaLabel) {
    try {
      const found = doc.querySelector(`[aria-label="${safeCssEscape(locator.ariaLabel)}"]`);
      if (found) {
        element = found;
        matchedBy = 'ariaLabel';
      }
    } catch {
      // Continue
    }
  }

  // 5. Try placeholder
  if (!element && locator.placeholder) {
    try {
      const found = doc.querySelector(`[placeholder="${safeCssEscape(locator.placeholder)}"]`);
      if (found) {
        element = found;
        matchedBy = 'placeholder';
      }
    } catch {
      // Continue
    }
  }

  // 6. Try semantic role or tag + text snippet
  if (!element && locator.textSnippet && (locator.role === 'button' || locator.role === 'link' || locator.tagName === 'a' || locator.tagName === 'button')) {
    try {
      const candidates = doc.querySelectorAll(locator.tagName || 'button, a, [role="button"]');
      if (candidates) {
        for (const cand of candidates) {
          const text = cand.innerText || cand.textContent || '';
          if (text.replace(/\s+/g, ' ').trim() === locator.textSnippet) {
            element = cand;
            matchedBy = 'textSnippet';
            break;
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 7. Try structural CSS path
  if (!element && locator.cssPath) {
    try {
      const found = doc.querySelector(locator.cssPath);
      if (found) {
        element = found;
        matchedBy = 'cssPath';
      }
    } catch {
      // Continue
    }
  }

  // 8. Try structural XPath
  if (!element && locator.xpath && doc.evaluate) {
    try {
      const result = doc.evaluate(locator.xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (result && result.singleNodeValue && result.singleNodeValue.nodeType === 1) {
        element = result.singleNodeValue;
        matchedBy = 'xpath';
      }
    } catch {
      // Continue
    }
  }

  // Evaluated result
  if (!element) {
    return {
      element: null,
      status: 'not_found',
      matchedBy: null,
      reason: `Element not found in DOM for locator: ${locator.summary}`
    };
  }

  // Check visibility in current viewport
  const visible = isElementVisible(element);
  if (!visible) {
    return {
      element,
      status: 'hidden',
      matchedBy,
      reason: `Element exists in DOM (matched by ${matchedBy}) but is hidden in this viewport (display:none, visibility:hidden, or zero size)`
    };
  }

  return {
    element,
    status: 'found',
    matchedBy,
    reason: null
  };
}
