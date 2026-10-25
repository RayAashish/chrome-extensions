/**
 * Smart PII Sanitizer - Background Service Worker (Manifest V3)
 * Handles context menus, keyboard shortcuts, side panel routing,
 * dynamic content script registration, and ephemeral session storage synchronization.
 */

import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

const DEFAULT_SETTINGS = {
  sensitivity: 'balanced',
  enableNames: false,
  autoSanitizePaste: false,
  autoExpireMinutes: 0,
  allowlist: [],
  customRules: [],
  enabledCategories: {
    EMAIL: true,
    NETWORK: true,
    SECRETS: true,
    FINANCIAL: true,
    ID_CARDS: true,
    CONTACT: true,
    NAMES: false
  }
};

const SUPPORTED_HOST_ORIGINS = [
  'https://chatgpt.com/*',
  'https://*.claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*',
  'https://www.perplexity.ai/*',
  'https://chat.deepseek.com/*',
  'https://grok.com/*'
];

// Initialize on install or extension update
chrome.runtime.onInstalled.addListener(async () => {
  // 1. Allow content scripts to read session storage if necessary
  if (chrome.storage && chrome.storage.session && chrome.storage.session.setAccessLevel) {
    try {
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
      });
    } catch (e) {
      console.warn('[Smart PII Sanitizer] Could not set session storage access level:', e);
    }
  }

  // 2. Set default local settings if not yet present
  const currentSettings = await chrome.storage.local.get('smart_pii_settings');
  if (!currentSettings || !currentSettings.smart_pii_settings) {
    await chrome.storage.local.set({ smart_pii_settings: DEFAULT_SETTINGS });
  }

  // 3. Register Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'smart_pii_root',
      title: 'Smart PII Sanitizer',
      contexts: ['selection', 'page', 'editable']
    });

    chrome.contextMenus.create({
      id: 'smart_pii_sanitize',
      parentId: 'smart_pii_root',
      title: 'Sanitize selection (copy dummy values to clipboard)',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'smart_pii_reverse',
      parentId: 'smart_pii_root',
      title: 'Reverse-map selection (restore original values)',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'smart_pii_separator',
      parentId: 'smart_pii_root',
      type: 'separator',
      contexts: ['selection', 'page', 'editable']
    });

    chrome.contextMenus.create({
      id: 'smart_pii_open_panel',
      parentId: 'smart_pii_root',
      title: 'Open Side Panel Workspace',
      contexts: ['all']
    });
  });

  // 4. Sync dynamic content scripts for any already-granted origins
  await syncRegisteredContentScripts();
});

// Sync registered content scripts for permitted AI chat origins
async function syncRegisteredContentScripts() {
  if (!chrome.scripting || !chrome.scripting.registerContentScripts) return;

  try {
    const granted = await chrome.permissions.getAll();
    const grantedOrigins = (granted.origins || []).filter(origin =>
      SUPPORTED_HOST_ORIGINS.some(supported => origin.includes(supported.replace('/*', '')))
    );

    // Unregister existing first to prevent duplicates
    const existing = await chrome.scripting.getRegisteredContentScripts();
    const existingIds = existing.map(s => s.id).filter(id => id.startsWith('paste_guard_'));
    if (existingIds.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: existingIds });
    }

    if (grantedOrigins.length > 0) {
      await chrome.scripting.registerContentScripts([
        {
          id: 'paste_guard_active',
          matches: grantedOrigins,
          js: ['content/paste-guard.js'],
          runAt: 'document_end'
        }
      ]);
    }
  } catch (err) {
    console.warn('[Smart PII Sanitizer] Content script registration check:', err);
  }
}

// Handle Context Menu Actions
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'smart_pii_open_panel') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    return;
  }

  const selectedText = info.selectionText || '';
  if (!selectedText) return;

  // Load vault and settings
  const vault = new Vault();
  await vault.loadFromStorage();

  const settingsStore = await chrome.storage.local.get('smart_pii_settings');
  const settings = settingsStore.smart_pii_settings || DEFAULT_SETTINGS;

  if (info.menuItemId === 'smart_pii_sanitize') {
    const { sanitizedText, stats } = sanitize(selectedText, {
      vault,
      sensitivity: settings.sensitivity,
      enableNames: settings.enableNames,
      allowlist: settings.allowlist,
      customRules: settings.customRules,
      enabledCategories: settings.enabledCategories
    });

    await vault.saveToStorage();

    // Copy to clipboard in page context
    await copyTextToClipboardInTab(tab.id, sanitizedText);
    showNotificationToast(tab.id, `Sanitized ${stats.total} item(s) and copied to clipboard.`);
  } else if (info.menuItemId === 'smart_pii_reverse') {
    const { restoredText, restoredCount } = reverseMap(selectedText, vault);
    await copyTextToClipboardInTab(tab.id, restoredText);
    showNotificationToast(tab.id, `Restored ${restoredCount} item(s) from vault to clipboard.`);
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || !tab.id) return;

  if (command === 'sanitize_selection' || command === 'reverse_map_selection') {
    // Read current selection from active page
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || ''
      });

      const selectedText = results?.[0]?.result || '';
      if (!selectedText) return;

      const vault = new Vault();
      await vault.loadFromStorage();

      const settingsStore = await chrome.storage.local.get('smart_pii_settings');
      const settings = settingsStore.smart_pii_settings || DEFAULT_SETTINGS;

      if (command === 'sanitize_selection') {
        const { sanitizedText, stats } = sanitize(selectedText, {
          vault,
          sensitivity: settings.sensitivity,
          enableNames: settings.enableNames,
          allowlist: settings.allowlist,
          customRules: settings.customRules,
          enabledCategories: settings.enabledCategories
        });
        await vault.saveToStorage();
        await copyTextToClipboardInTab(tab.id, sanitizedText);
        showNotificationToast(tab.id, `Sanitized ${stats.total} item(s) to clipboard.`);
      } else {
        const { restoredText, restoredCount } = reverseMap(selectedText, vault);
        await copyTextToClipboardInTab(tab.id, restoredText);
        showNotificationToast(tab.id, `Restored ${restoredCount} item(s) to clipboard.`);
      }
    } catch (err) {
      console.warn('[Smart PII Sanitizer] Command error:', err);
    }
  }
});

// Helper: Copy text to clipboard inside active tab
async function copyTextToClipboardInTab(tabId, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (textToCopy) => {
        navigator.clipboard.writeText(textToCopy);
      },
      args: [text]
    });
  } catch (err) {
    console.warn('[Smart PII Sanitizer] Clipboard copy error:', err);
  }
}

// Helper: Show brief visual toast inside tab
async function showNotificationToast(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg) => {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #1e293b;
          color: #f8fafc;
          padding: 12px 20px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
          border: 1px solid #334155;
          z-index: 2147483647;
          pointer-events: none;
          transition: opacity 0.3s ease, transform 0.3s ease;
          opacity: 0;
          transform: translateY(10px);
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
          toast.style.opacity = '1';
          toast.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(10px)';
          setTimeout(() => toast.remove(), 300);
        }, 2600);
      },
      args: [message]
    });
  } catch (err) {
    console.warn('[Smart PII Sanitizer] Toast notification error:', err);
  }
}

// Offscreen Document Clipboard Manager for Manifest V3
async function ensureOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      if (contexts && contexts.length > 0) return;
    } catch (_) {}
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Read and write clipboard text for PII sanitization'
    });
  } catch (err) {
    // Document already exists or active
  }
}

async function readClipboardViaOffscreen() {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen-clipboard',
    action: 'READ'
  });
  return res?.text || '';
}

async function writeClipboardViaOffscreen(text) {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen-clipboard',
    action: 'WRITE',
    text
  });
  return Boolean(res?.success);
}

// Handle Runtime Messages from UI & Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Offscreen internal routing bypass
  if (request.target === 'offscreen-clipboard') {
    return false;
  }

  if (request.action === 'READ_CLIPBOARD' || request.type === 'READ_CLIPBOARD') {
    (async () => {
      try {
        const text = await readClipboardViaOffscreen();
        sendResponse({ success: true, text });
      } catch (err) {
        sendResponse({ success: false, error: err.message, text: '' });
      }
    })();
    return true;
  }

  if (request.action === 'WRITE_CLIPBOARD' || request.type === 'WRITE_CLIPBOARD') {
    (async () => {
      try {
        const ok = await writeClipboardViaOffscreen(request.text || '');
        sendResponse({ success: ok });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  if (request.type === 'SYNC_PERMISSIONS') {
    syncRegisteredContentScripts().then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.type === 'OPEN_SIDE_PANEL' || request.action === 'OPEN_SIDE_PANEL') {
    if (sender.tab && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
  }

  // Centralized Sanitization for Content Scripts and Extension Contexts
  if (request.action === 'SANITIZE_TEXT' || request.type === 'SANITIZE_TEXT') {
    (async () => {
      try {
        const vault = new Vault();
        await vault.loadFromStorage();
        const settingsStore = await chrome.storage.local.get('smart_pii_settings');
        const settings = settingsStore.smart_pii_settings || DEFAULT_SETTINGS;

        const { sanitizedText, stats } = sanitize(request.text || '', {
          vault,
          sensitivity: settings.sensitivity,
          enableNames: settings.enableNames,
          allowlist: settings.allowlist,
          customRules: settings.customRules,
          enabledCategories: settings.enabledCategories
        });

        await vault.saveToStorage();
        sendResponse({ success: true, sanitizedText, stats });
      } catch (err) {
        console.error('[Smart PII Sanitizer] Background sanitize error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep response channel open for async callback
  }

  // Centralized Reverse Mapping for Content Scripts and Extension Contexts
  if (request.action === 'REVERSE_MAP_TEXT' || request.type === 'REVERSE_MAP_TEXT') {
    (async () => {
      try {
        const vault = new Vault();
        await vault.loadFromStorage();

        const { restoredText, restoredCount, stats } = reverseMap(request.text || '', vault);
        sendResponse({ success: true, restoredText, restoredCount, stats });
      } catch (err) {
        console.error('[Smart PII Sanitizer] Background reverse error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Get Vault Stats
  if (request.action === 'GET_VAULT_STATS' || request.type === 'GET_VAULT_STATS') {
    (async () => {
      const vault = new Vault();
      await vault.loadFromStorage();
      sendResponse({ count: vault.getAllEntries().length });
    })();
    return true;
  }
});
