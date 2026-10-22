/**
 * Smart PII Sanitizer - Paste Guard Content Script
 * Intercepts clipboard paste on AI chat inputs (ChatGPT, Claude, Gemini, Copilot, etc.)
 * Detects sensitive PII/secrets locally, displays an isolated Shadow DOM confirmation banner,
 * preserves editor undo/redo history, and provides a floating reverse-map helper.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__SMART_PII_PASTE_GUARD_LOADED__) return;
  window.__SMART_PII_PASTE_GUARD_LOADED__ = true;

  let cachedSettings = null;
  let activeBanner = null;
  let activeFloatingBtn = null;

  // Local in-memory vault copy synchronized with session storage
  let localVaultState = null;

  // Quick synchronous regex detectors for instant paste interception
  // Runs in < 2ms directly on clipboardData to avoid asynchronous delay during paste
  const QUICK_PII_PATTERNS = [
    { type: 'EMAIL', name: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
    { type: 'IPV4', name: 'IP Address', regex: /(?:^|(?<=[^\w.-]))(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?=[^\w.-]|$)/ },
    { type: 'KEY', name: 'API Key', regex: /\b(?:sk_live|pk_live|sk_test|pk_test|ghp|gho|ghu|ghs|ghr|AKIA|ABIA|ACCA|ASIA|AIza)[0-9A-Za-z_-]{16,}\b|\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,32}\b/ },
    { type: 'JWT', name: 'JWT Token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
    { type: 'CREDIT_CARD', name: 'Credit Card', regex: /\b(?:\d{4}[- ]){3}\d{4}\b/ },
    { type: 'SSN', name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
    { type: 'SECRET', name: 'Secret / Password', regex: /(?:password|secret|token|api_key|credential)\s*[:=]\s*["']?([^"'\s,;]{8,})["']?/i },
    { type: 'PEM', name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ }
  ];

  // Refresh settings from storage
  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get('smart_pii_settings');
      cachedSettings = res.smart_pii_settings || {};
      const sessionVault = await chrome.storage.session.get('smart_pii_vault');
      localVaultState = sessionVault.smart_pii_vault || null;
    } catch {
      // Storage unavailable in isolated tab context
    }
  }

  loadSettings();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.smart_pii_settings) {
      cachedSettings = changes.smart_pii_settings.newValue;
    }
    if (changes.smart_pii_vault) {
      localVaultState = changes.smart_pii_vault.newValue;
    }
  });

  /**
   * Fast synchronous scan to decide if interception is necessary.
   */
  function quickScanText(text) {
    if (!text || text.length < 5) return { hasSensitive: false, count: 0, categories: [] };
    let count = 0;
    const detectedCategories = new Set();

    for (const pat of QUICK_PII_PATTERNS) {
      const matches = text.match(pat.regex);
      if (matches && matches.length > 0) {
        count += matches.length;
        detectedCategories.add(pat.name);
      }
    }

    return {
      hasSensitive: count > 0,
      count,
      categories: Array.from(detectedCategories)
    };
  }

  /**
   * Text insertion logic respecting ProseMirror, Lexical, Draft.js, textarea, and contenteditable.
   */
  function insertSanitizedText(target, text) {
    if (!target) return;

    target.focus();

    // 1. Textarea / Input
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      target.setRangeText(text, start, end, 'end');
      target.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return;
    }

    // 2. Contenteditable (ProseMirror / Lexical / Rich Text)
    if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
      // Use document.execCommand('insertText') which modern rich text engines handle natively
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch (err) {
        inserted = false;
      }

      if (!inserted) {
        // Fallback: Dispatch synthetic InputEvent with inputType 'insertFromPaste'
        try {
          const inputEvent = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertFromPaste',
            data: text
          });
          target.dispatchEvent(inputEvent);

          // Direct DOM range insertion fallback
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(text);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          target.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        } catch (e) {
          console.warn('[Smart PII Sanitizer] DOM insertion error:', e);
        }
      }
    }
  }

  /**
   * Intercept paste event on the capture phase.
   */
  window.addEventListener(
    'paste',
    async (event) => {
      const target = event.target;
      if (!target) return;

      const clipboardText = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
      if (!clipboardText) return;

      const scanResult = quickScanText(clipboardText);
      if (!scanResult.hasSensitive) {
        // No sensitive data detected -> allow normal native paste
        return;
      }

      // Check allowlist
      if (cachedSettings && Array.isArray(cachedSettings.allowlist)) {
        for (const allowed of cachedSettings.allowlist) {
          if (clipboardText.trim() === allowed.trim()) {
            return; // Allowlisted
          }
        }
      }

      // Intercept!
      event.preventDefault();
      event.stopImmediatePropagation();

      // Check if auto-sanitize is enabled
      if (cachedSettings && cachedSettings.autoSanitizePaste) {
        executeSanitizeAndPaste(target, clipboardText);
        return;
      }

      // Show Shadow DOM banner
      showPasteGuardBanner(target, clipboardText, scanResult);
    },
    true // Capture phase to beat page listeners
  );

  /**
   * Perform full sanitization and insert.
   */
  async function executeSanitizeAndPaste(target, rawText) {
    // Dynamic import core sanitizer
    const { sanitize } = await import(chrome.runtime.getURL('core/sanitizer.js'));
    const { Vault } = await import(chrome.runtime.getURL('core/vault.js'));

    const vault = new Vault();
    await vault.loadFromStorage();

    const { sanitizedText, stats } = sanitize(rawText, {
      vault,
      sensitivity: cachedSettings?.sensitivity || 'balanced',
      enableNames: cachedSettings?.enableNames || false,
      allowlist: cachedSettings?.allowlist || [],
      customRules: cachedSettings?.customRules || [],
      enabledCategories: cachedSettings?.enabledCategories || {}
    });

    await vault.saveToStorage();
    insertSanitizedText(target, sanitizedText);
    showInlineToast(`Sanitized and pasted ${stats.total} sensitive item(s).`);
  }

  /**
   * Render isolated Shadow DOM Banner near the input target.
   */
  function showPasteGuardBanner(target, rawText, scanResult) {
    removeExistingBanner();

    const hostDiv = document.createElement('div');
    hostDiv.id = 'smart-pii-paste-guard-root';
    hostDiv.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      display: block;
      pointer-events: auto;
    `;

    const shadow = hostDiv.attachShadow({ mode: 'open' });

    // Calculate position relative to target
    const rect = target.getBoundingClientRect();
    const topPos = Math.max(10, window.scrollY + rect.top - 68);
    const leftPos = Math.max(10, window.scrollX + rect.left);

    hostDiv.style.top = `${topPos}px`;
    hostDiv.style.left = `${leftPos}px`;
    hostDiv.style.width = `${Math.min(rect.width || 480, 520)}px`;

    const categoriesBadges = scanResult.categories
      .map((cat) => `<span class="badge">${cat}</span>`)
      .join('');

    shadow.innerHTML = `
      <style>
        .banner {
          background: #0f172a;
          color: #f8fafc;
          border: 1px solid #3b82f6;
          border-radius: 10px;
          padding: 10px 14px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.25);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          animation: slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .icon {
          width: 18px;
          height: 18px;
          color: #38bdf8;
          flex-shrink: 0;
        }
        .title {
          font-weight: 600;
          color: #e2e8f0;
        }
        .badge {
          background: #1e293b;
          color: #94a3b8;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 11px;
          border: 1px solid #334155;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        button {
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          transition: all 0.15s ease;
        }
        .btn-sanitize {
          background: #2563eb;
          color: #ffffff;
        }
        .btn-sanitize:hover {
          background: #1d4ed8;
        }
        .btn-raw {
          background: #334155;
          color: #cbd5e1;
        }
        .btn-raw:hover {
          background: #475569;
          color: #ffffff;
        }
        .btn-close {
          background: transparent;
          color: #64748b;
          padding: 4px 6px;
        }
        .btn-close:hover {
          color: #e2e8f0;
        }
      </style>
      <div class="banner" role="alert" aria-live="assertive">
        <div class="info">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span class="title">Found ${scanResult.count} sensitive item(s):</span>
          ${categoriesBadges}
        </div>
        <div class="actions">
          <button class="btn-sanitize" id="btn-sanitize" title="Replace with deterministic dummy tokens (Enter)">Sanitize & Paste</button>
          <button class="btn-raw" id="btn-raw" title="Paste original without sanitizing (P)">Paste Original</button>
          <button class="btn-close" id="btn-close" title="Dismiss (Esc)">&times;</button>
        </div>
      </div>
    `;

    document.body.appendChild(hostDiv);
    activeBanner = hostDiv;

    // Handlers
    const btnSanitize = shadow.getElementById('btn-sanitize');
    const btnRaw = shadow.getElementById('btn-raw');
    const btnClose = shadow.getElementById('btn-close');

    btnSanitize.focus();

    btnSanitize.addEventListener('click', () => {
      removeExistingBanner();
      executeSanitizeAndPaste(target, rawText);
    });

    btnRaw.addEventListener('click', () => {
      removeExistingBanner();
      insertSanitizedText(target, rawText);
    });

    btnClose.addEventListener('click', () => {
      removeExistingBanner();
    });

    // Keyboard navigation within banner
    hostDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnSanitize.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        removeExistingBanner();
      } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        btnRaw.click();
      }
    });
  }

  function removeExistingBanner() {
    if (activeBanner) {
      activeBanner.remove();
      activeBanner = null;
    }
  }

  /**
   * Floating "Reverse Map" pill helper when selecting text on AI chat page.
   */
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : '';

    if (!selectedText || selectedText.length < 5) {
      removeFloatingButton();
      return;
    }

    // Check if selection contains placeholder indicators
    const hasPlaceholders =
      /user_[A-Z]+@example\.com/.test(selectedText) ||
      /REDACTED_[A-Z0-9_]+/.test(selectedText) ||
      /host_[A-Z]+\.example\.internal/.test(selectedText) ||
      /Person_[A-Z]+/.test(selectedText);

    if (hasPlaceholders) {
      showFloatingReverseMapButton(selectedText);
    } else {
      removeFloatingButton();
    }
  });

  function showFloatingReverseMapButton(selectedText) {
    removeFloatingButton();

    const btn = document.createElement('div');
    btn.id = 'smart-pii-floating-reverse';
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid #38bdf8;
      border-radius: 20px;
      padding: 8px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    `;

    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      Reverse-Map Selection
    `;

    btn.addEventListener('click', async () => {
      const { reverseMap } = await import(chrome.runtime.getURL('core/reverse.js'));
      const { Vault } = await import(chrome.runtime.getURL('core/vault.js'));

      const vault = new Vault();
      await vault.loadFromStorage();

      const { restoredText, restoredCount } = reverseMap(selectedText, vault);
      await navigator.clipboard.writeText(restoredText);
      showInlineToast(`Restored ${restoredCount} placeholder(s) to clipboard!`);
      removeFloatingButton();
    });

    document.body.appendChild(btn);
    activeFloatingBtn = btn;
  }

  function removeFloatingButton() {
    if (activeFloatingBtn) {
      activeFloatingBtn.remove();
      activeFloatingBtn = null;
    }
  }

  function showInlineToast(msg) {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #334155;
      padding: 10px 18px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
      z-index: 2147483647;
      transition: opacity 0.25s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }
})();
