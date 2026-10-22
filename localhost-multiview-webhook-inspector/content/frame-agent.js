/**
 * Frame Agent (Content Script)
 * Injected into framed localhost development applications.
 * Handles bidirectional interaction synchronization, event loop prevention,
 * React/Vue/Angular controlled input updates, element locator resolution,
 * and responsive diagnostic checks (overflow, breakpoints, touch targets).
 */

(function () {
  'use strict';

  // Only activate if running inside an iframe (Workspace parent window)
  if (window.self === window.top) {
    return;
  }

  const PROTOCOL_VERSION = '1.0.0';

  // State
  let frameId = null;
  let channelToken = null;
  let syncEnabled = true;
  let hoverSync = false;
  let frameMode = 'sync'; // 'sync', 'lead', 'follow', 'independent'
  let isReplaying = false;
  let suppressUntil = 0;
  let sequenceCounter = 0;
  let isScrollQueued = false;
  let lastReportedBreakpoints = null;

  // ==========================================
  // 1. HANDSHAKE WITH WORKSPACE PARENT
  // ==========================================

  function sendToParent(type, payload = {}) {
    if (!type) return;
    const envelope = {
      protocol: PROTOCOL_VERSION,
      type,
      sourceFrameId: frameId,
      channelToken,
      sequence: ++sequenceCounter,
      timestamp: Date.now(),
      payload
    };
    try {
      window.parent.postMessage(envelope, '*');
    } catch (err) {
      console.warn('[LMVI FrameAgent] Failed to postMessage to parent:', err);
    }
  }

  function initiateHandshake() {
    sendToParent('LMVI_HANDSHAKE_INIT', {
      url: window.location.href,
      title: document.title,
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  // Window message router
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object' || data.protocol !== PROTOCOL_VERSION) {
      return;
    }

    // Handle Handshake Ack
    if (data.type === 'LMVI_HANDSHAKE_ACK') {
      frameId = data.payload.frameId;
      channelToken = data.payload.channelToken;
      syncEnabled = data.payload.settings?.syncEnabled ?? true;
      hoverSync = data.payload.settings?.hoverSync ?? false;
      frameMode = data.payload.settings?.frameMode ?? 'sync';

      // Perform initial diagnostics once handshaked
      reportBreakpoints();
      return;
    }

    // Enforce channel token security for all operational messages
    if (channelToken && data.channelToken !== channelToken) {
      return;
    }

    // Ignore if frame is set to independent
    if (frameMode === 'independent') {
      return;
    }

    // If frame is in lead-only mode, it ignores inbound synchronization
    if (frameMode === 'lead' && data.isReplay) {
      return;
    }

    // Dispatch message to corresponding handlers
    switch (data.type) {
      case 'LMVI_SYNC_SCROLL':
        handleReplayScroll(data.payload);
        break;
      case 'LMVI_SYNC_CLICK':
        handleReplayClick(data.payload);
        break;
      case 'LMVI_SYNC_INPUT':
        handleReplayInput(data.payload);
        break;
      case 'LMVI_SYNC_KEY':
        handleReplayKey(data.payload);
        break;
      case 'LMVI_SYNC_NAV':
        handleReplayNav(data.payload);
        break;
      case 'LMVI_SYNC_HOVER':
        if (hoverSync) handleReplayHover(data.payload);
        break;
      case 'LMVI_SETTINGS_UPDATE':
        handleSettingsUpdate(data.payload);
        break;
      case 'LMVI_REQUEST_OVERFLOW_CHECK':
        detectAndHighlightOverflow(data.payload.highlight);
        break;
      case 'LMVI_RELOAD_FRAME':
        window.location.reload();
        break;
    }
  });

  // Start handshake on document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initiateHandshake);
  } else {
    initiateHandshake();
  }

  // ==========================================
  // 2. LOCATOR GENERATION & RESOLUTION
  // ==========================================

  function isDynamicId(id) {
    if (!id || typeof id !== 'string') return true;
    if (/^[0-9]/.test(id)) return true;
    if (/^[a-f0-9-]{32,}$/i.test(id)) return true;
    if (/^(:r[0-9a-z]+:)/.test(id)) return true;
    if (/^__/.test(id)) return true;
    return false;
  }

  function getNormalizedText(el, max = 40) {
    if (!el) return null;
    const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return txt ? txt.slice(0, max) : null;
  }

  function buildCssPath(element) {
    if (!element || element.nodeType !== 1) return '';
    const path = [];
    let current = element;
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      const tagName = current.tagName.toLowerCase();
      if (current.id && !isDynamicId(current.id)) {
        path.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      let siblingIndex = 1;
      let sibling = current.previousElementSibling;
      let hasSiblingsWithSameTag = false;
      while (sibling) {
        if (sibling.tagName.toLowerCase() === tagName) {
          siblingIndex++;
          hasSiblingsWithSameTag = true;
        }
        sibling = sibling.previousElementSibling;
      }
      let next = current.nextElementSibling;
      while (next) {
        if (next.tagName.toLowerCase() === tagName) {
          hasSiblingsWithSameTag = true;
          break;
        }
        next = next.nextElementSibling;
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

  function buildElementLocator(element) {
    if (!element || element.nodeType !== 1) return null;
    const testId = element.getAttribute('data-testid') ||
                   element.getAttribute('data-test-id') ||
                   element.getAttribute('data-cy') ||
                   element.getAttribute('data-qa') ||
                   null;
    const rawId = element.id && !isDynamicId(element.id) ? element.id : null;
    const name = element.getAttribute('name') || null;
    const ariaLabel = element.getAttribute('aria-label') || null;
    const role = element.getAttribute('role') || element.tagName.toLowerCase();
    const placeholder = element.getAttribute('placeholder') || null;
    const textSnippet = getNormalizedText(element, 40);
    const cssPath = buildCssPath(element);

    return {
      tagName: element.tagName.toLowerCase(),
      testId,
      id: rawId,
      name,
      ariaLabel,
      role,
      placeholder,
      textSnippet,
      cssPath,
      summary: testId || rawId || ariaLabel || name || textSnippet || cssPath
    };
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const rects = el.getClientRects();
    if (!rects || rects.length === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return true;
  }

  function resolveElementLocator(loc) {
    if (!loc || typeof loc !== 'object') {
      return { element: null, status: 'not_found', reason: 'Empty locator' };
    }

    let el = null;
    let matchedBy = null;

    // 1. TestId
    if (loc.testId) {
      const selectors = [
        `[data-testid="${CSS.escape(loc.testId)}"]`,
        `[data-test-id="${CSS.escape(loc.testId)}"]`,
        `[data-cy="${CSS.escape(loc.testId)}"]`,
        `[data-qa="${CSS.escape(loc.testId)}"]`
      ];
      for (const sel of selectors) {
        try {
          const found = document.querySelector(sel);
          if (found) { el = found; matchedBy = 'testId'; break; }
        } catch {}
      }
    }

    // 2. ID
    if (!el && loc.id) {
      try {
        const found = document.getElementById(loc.id);
        if (found) { el = found; matchedBy = 'id'; }
      } catch {}
    }

    // 3. Name
    if (!el && loc.name) {
      try {
        const found = document.querySelector(`[name="${CSS.escape(loc.name)}"]`);
        if (found) { el = found; matchedBy = 'name'; }
      } catch {}
    }

    // 4. Aria-label
    if (!el && loc.ariaLabel) {
      try {
        const found = document.querySelector(`[aria-label="${CSS.escape(loc.ariaLabel)}"]`);
        if (found) { el = found; matchedBy = 'ariaLabel'; }
      } catch {}
    }

    // 5. Placeholder
    if (!el && loc.placeholder) {
      try {
        const found = document.querySelector(`[placeholder="${CSS.escape(loc.placeholder)}"]`);
        if (found) { el = found; matchedBy = 'placeholder'; }
      } catch {}
    }

    // 6. Text snippet match on interactive tags
    if (!el && loc.textSnippet && (loc.role === 'button' || loc.role === 'link' || loc.tagName === 'a' || loc.tagName === 'button')) {
      const items = document.querySelectorAll(loc.tagName || 'button, a, [role="button"]');
      for (const item of items) {
        const t = (item.innerText || item.textContent || '').replace(/\s+/g, ' ').trim();
        if (t === loc.textSnippet) {
          el = item;
          matchedBy = 'textSnippet';
          break;
        }
      }
    }

    // 7. Structural CSS Path
    if (!el && loc.cssPath) {
      try {
        const found = document.querySelector(loc.cssPath);
        if (found) { el = found; matchedBy = 'cssPath'; }
      } catch {}
    }

    if (!el) {
      return { element: null, status: 'not_found', matchedBy: null, reason: 'Element not present in DOM' };
    }

    const visible = isElementVisible(el);
    if (!visible) {
      return {
        element: el,
        status: 'hidden',
        matchedBy,
        reason: 'Element exists in DOM but is hidden in this viewport (display:none or zero size)'
      };
    }

    return { element: el, status: 'found', matchedBy, reason: null };
  }

  // ==========================================
  // 3. EVENT CAPTURE (LEADER TRANSMISSION)
  // ==========================================

  function shouldIgnoreEvent(e) {
    if (!syncEnabled) return true;
    if (frameMode === 'follow' || frameMode === 'independent') return true;
    if (isReplaying) return true;
    if (performance.now() < suppressUntil) return true;
    if (e && e.isTrusted === false) return true;
    return false;
  }

  // Scroll Sync
  window.addEventListener('scroll', () => {
    if (shouldIgnoreEvent(null)) return;

    if (!isScrollQueued) {
      isScrollQueued = true;
      requestAnimationFrame(() => {
        isScrollQueued = false;
        const doc = document.documentElement;
        const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
        const maxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);

        const scrollYPercent = maxScrollY > 0 ? doc.scrollTop / maxScrollY : 0;
        const scrollXPercent = maxScrollX > 0 ? doc.scrollLeft / maxScrollX : 0;

        sendToParent('LMVI_SYNC_SCROLL', {
          scrollYPercent,
          scrollXPercent,
          scrollTop: doc.scrollTop,
          scrollLeft: doc.scrollLeft
        });
      });
    }
  }, { passive: true });

  // Click Sync
  document.addEventListener('click', e => {
    if (shouldIgnoreEvent(e)) return;

    // Do not sync our own internal diagnostic overlays
    if (e.target.closest && e.target.closest('.lmvi-synthetic-ripple')) return;

    const locator = buildElementLocator(e.target);
    if (!locator) return;

    sendToParent('LMVI_SYNC_CLICK', {
      locator,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey
    });
  }, true);

  // Input & Change Sync (Text, Textarea, Checkbox, Radio, Select)
  function handleFormInput(e) {
    if (shouldIgnoreEvent(e)) return;

    const el = e.target;
    const locator = buildElementLocator(el);
    if (!locator) return;

    const payload = {
      locator,
      tagName: el.tagName.toLowerCase(),
      type: el.type || null,
      value: el.value !== undefined ? el.value : (el.innerText || ''),
      checked: el.checked !== undefined ? el.checked : false,
      selectionStart: el.selectionStart || 0,
      selectionEnd: el.selectionEnd || 0
    };

    sendToParent('LMVI_SYNC_INPUT', payload);
  }

  document.addEventListener('input', handleFormInput, true);
  document.addEventListener('change', handleFormInput, true);

  // Keyboard Sync
  document.addEventListener('keydown', e => {
    if (shouldIgnoreEvent(e)) return;

    // Only sync actionable navigation/form keys
    const syncKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!syncKeys.includes(e.key)) return;

    const locator = buildElementLocator(e.target);
    sendToParent('LMVI_SYNC_KEY', {
      locator,
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey
    });
  }, true);

  // Hover Sync (Opt-in)
  document.addEventListener('mousemove', e => {
    if (!hoverSync || shouldIgnoreEvent(e)) return;
    const locator = buildElementLocator(e.target);
    if (!locator) return;
    sendToParent('LMVI_SYNC_HOVER', { locator });
  }, { passive: true });

  // SPA Navigation Interception (pushState / replaceState / popstate / hashchange)
  function hookHistory() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      notifyNavigation();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      notifyNavigation();
      return result;
    };

    window.addEventListener('popstate', notifyNavigation);
    window.addEventListener('hashchange', notifyNavigation);
  }

  function notifyNavigation() {
    if (shouldIgnoreEvent(null)) return;
    sendToParent('LMVI_SYNC_NAV', {
      url: window.location.href,
      path: window.location.pathname + window.location.search + window.location.hash
    });
  }

  hookHistory();

  // ==========================================
  // 4. EVENT REPLAY (FOLLOWER EXECUTION)
  // ==========================================

  function withSuppression(callback) {
    isReplaying = true;
    suppressUntil = performance.now() + 80;
    try {
      callback();
    } catch (err) {
      console.warn('[LMVI FrameAgent] Replay exception:', err);
    } finally {
      // Release suppression window after next microtask / short delay
      setTimeout(() => {
        isReplaying = false;
      }, 30);
    }
  }

  function handleReplayScroll(payload) {
    withSuppression(() => {
      const doc = document.documentElement;
      const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
      const maxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);

      const targetTop = Math.round(payload.scrollYPercent * maxScrollY);
      const targetLeft = Math.round(payload.scrollXPercent * maxScrollX);

      window.scrollTo({
        top: targetTop,
        left: targetLeft,
        behavior: 'instant'
      });
    });
  }

  function handleReplayClick(payload) {
    const resolution = resolveElementLocator(payload.locator);

    if (resolution.status !== 'found') {
      // Element missing or hidden in this follower's responsive layout
      sendToParent('LMVI_ELEMENT_NOT_FOUND', {
        targetLocator: payload.locator,
        status: resolution.status,
        reason: resolution.reason
      });
      return;
    }

    const el = resolution.element;

    // Show ripple effect at element position
    showRippleOnElement(el);

    withSuppression(() => {
      // Focus if applicable
      if (typeof el.focus === 'function') {
        el.focus();
      }

      // Dispatch real MouseEvent
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        altKey: payload.altKey,
        ctrlKey: payload.ctrlKey,
        metaKey: payload.metaKey,
        shiftKey: payload.shiftKey
      });

      el.dispatchEvent(clickEvent);
    });
  }

  function handleReplayInput(payload) {
    const resolution = resolveElementLocator(payload.locator);
    if (resolution.status !== 'found') {
      sendToParent('LMVI_ELEMENT_NOT_FOUND', {
        targetLocator: payload.locator,
        status: resolution.status,
        reason: resolution.reason
      });
      return;
    }

    const el = resolution.element;
    const tagName = el.tagName.toLowerCase();
    const inputType = (el.type || '').toLowerCase();

    withSuppression(() => {
      if (inputType === 'checkbox' || inputType === 'radio') {
        // Native property setter for React/Vue/Angular
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, payload.checked);
        } else {
          el.checked = payload.checked;
        }
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      } else if (tagName === 'textarea') {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, payload.value);
        } else {
          el.value = payload.value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      } else if (tagName === 'input') {
        // Critical: React controlled inputs wrap HTMLInputElement.prototype.value setter
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, payload.value);
        } else {
          el.value = payload.value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      } else if (tagName === 'select') {
        el.value = payload.value;
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      } else if (el.isContentEditable) {
        el.innerText = payload.value;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }

      // Restore caret selection if element is focused
      if (document.activeElement === el && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(payload.selectionStart, payload.selectionEnd);
        } catch {}
      }
    });
  }

  function handleReplayKey(payload) {
    const resolution = resolveElementLocator(payload.locator);
    const target = resolution.status === 'found' ? resolution.element : document.activeElement;

    withSuppression(() => {
      const keyEvent = new KeyboardEvent('keydown', {
        key: payload.key,
        code: payload.code,
        keyCode: payload.keyCode,
        bubbles: true,
        cancelable: true,
        altKey: payload.altKey,
        ctrlKey: payload.ctrlKey,
        metaKey: payload.metaKey,
        shiftKey: payload.shiftKey
      });
      target.dispatchEvent(keyEvent);
    });
  }

  function handleReplayNav(payload) {
    if (window.location.href !== payload.url) {
      window.location.href = payload.url;
    }
  }

  function handleReplayHover(payload) {
    const resolution = resolveElementLocator(payload.locator);
    if (resolution.status === 'found') {
      withSuppression(() => {
        resolution.element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
    }
  }

  function handleSettingsUpdate(settings) {
    if (settings.syncEnabled !== undefined) syncEnabled = settings.syncEnabled;
    if (settings.hoverSync !== undefined) hoverSync = settings.hoverSync;
    if (settings.frameMode !== undefined) frameMode = settings.frameMode;
  }

  function showRippleOnElement(el) {
    try {
      const rect = el.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'lmvi-synthetic-ripple';
      ripple.style.left = `${rect.left + rect.width / 2}px`;
      ripple.style.top = `${rect.top + rect.height / 2}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    } catch {}
  }

  // ==========================================
  // 5. RESPONSIVE DIAGNOSTIC HELPERS
  // ==========================================

  function detectAndHighlightOverflow(shouldHighlight = true) {
    // Remove existing highlight tags
    document.querySelectorAll('.lmvi-overflow-highlight').forEach(el => {
      el.classList.remove('lmvi-overflow-highlight');
      el.removeAttribute('data-lmvi-overflow');
    });

    const docWidth = window.innerWidth;
    const culprits = [];

    // Traverse all DOM elements
    const elements = document.body.querySelectorAll('*');
    for (const el of elements) {
      if (el.classList.contains('lmvi-synthetic-ripple')) continue;

      const rect = el.getBoundingClientRect();
      // Element extends past viewport right boundary
      if (rect.right > docWidth + 1) {
        const overflowPixels = Math.round(rect.right - docWidth);
        const locator = buildElementLocator(el);

        culprits.push({
          selector: locator ? locator.summary : el.tagName.toLowerCase(),
          overflowPixels,
          tagName: el.tagName.toLowerCase(),
          className: el.className || '',
          id: el.id || null
        });

        if (shouldHighlight) {
          el.classList.add('lmvi-overflow-highlight');
          el.setAttribute('data-lmvi-overflow', String(overflowPixels));
        }
      }
    }

    sendToParent('LMVI_OVERFLOW_REPORT', {
      count: culprits.length,
      culprits: culprits.slice(0, 10), // Top 10 offenders
      viewportWidth: docWidth
    });
  }

  function reportBreakpoints() {
    const width = window.innerWidth;
    const tailwind = [];
    if (width >= 640) tailwind.push('sm');
    if (width >= 768) tailwind.push('md');
    if (width >= 1024) tailwind.push('lg');
    if (width >= 1280) tailwind.push('xl');
    if (width >= 1536) tailwind.push('2xl');
    const activeTailwind = tailwind.length > 0 ? tailwind[tailwind.length - 1] : '<sm';

    const bootstrap = [];
    if (width >= 576) bootstrap.push('sm');
    if (width >= 768) bootstrap.push('md');
    if (width >= 992) bootstrap.push('lg');
    if (width >= 1200) bootstrap.push('xl');
    if (width >= 1400) bootstrap.push('xxl');
    const activeBootstrap = bootstrap.length > 0 ? bootstrap[bootstrap.length - 1] : '<sm';

    const report = {
      width,
      tailwind: activeTailwind,
      bootstrap: activeBootstrap
    };

    if (JSON.stringify(report) !== JSON.stringify(lastReportedBreakpoints)) {
      lastReportedBreakpoints = report;
      sendToParent('LMVI_BREAKPOINT_UPDATE', report);
    }
  }

  window.addEventListener('resize', () => {
    reportBreakpoints();
  });

  // Touch Target Warning Mode (Flag interactive elements < 44x44px)
  function checkTouchTargets() {
    const interactive = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
    interactive.forEach(el => {
      const rect = el.getBoundingClientRect();
      if ((rect.width > 0 && rect.width < 44) || (rect.height > 0 && rect.height < 44)) {
        el.classList.add('lmvi-touch-target-warning');
      }
    });
  }

  // Periodic HMR / Reconnect Heartbeat check
  setInterval(() => {
    if (frameId && channelToken) {
      reportBreakpoints();
    }
  }, 3000);

})();
