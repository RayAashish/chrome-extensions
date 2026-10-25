/**
 * Smart PII Sanitizer - Action Popup Controller
 */

import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

const vault = new Vault();
let settings = {};

const vaultItemCount = document.getElementById('vaultItemCount');
const sensitivityLabel = document.getElementById('sensitivityLabel');
const openSidePanelBtn = document.getElementById('openSidePanelBtn');
const quickSanitizeClipboardBtn = document.getElementById('quickSanitizeClipboardBtn');
const quickReverseClipboardBtn = document.getElementById('quickReverseClipboardBtn');
const autoSanitizeToggle = document.getElementById('autoSanitizeToggle');
const openOptionsLink = document.getElementById('openOptionsLink');

async function init() {
  await vault.loadFromStorage();
  const res = await chrome.storage.local.get('smart_pii_settings');
  settings = res.smart_pii_settings || { sensitivity: 'balanced', autoSanitizePaste: false };

  vaultItemCount.textContent = vault.getAllEntries().length.toString();
  sensitivityLabel.textContent = (settings.sensitivity || 'balanced').toUpperCase();
  autoSanitizeToggle.checked = Boolean(settings.autoSanitizePaste);

  attachEvents();
}

async function getClipboardText() {
  // Strategy 1: Synchronous DOM paste on helper textarea in popup
  try {
    const helper = document.getElementById('clipboardHelper');
    if (helper) {
      helper.value = '';
      helper.focus();
      const ok = document.execCommand('paste');
      if (ok && helper.value) {
        const val = helper.value;
        helper.value = '';
        return val;
      }
    }
  } catch (_) {}

  // Strategy 2: Offscreen document in background service worker (Google MV3 official)
  try {
    const res = await chrome.runtime.sendMessage({ action: 'READ_CLIPBOARD' });
    if (res && res.success && res.text) {
      return res.text;
    }
  } catch (_) {}

  // Strategy 3: navigator.clipboard.readText()
  try {
    const navText = await navigator.clipboard.readText();
    if (navText) return navText;
  } catch (_) {}

  // Strategy 4: Read via active tab scripting context
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            return await navigator.clipboard.readText();
          } catch (_) {
            return '';
          }
        }
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    }
  } catch (_) {}

  return '';
}

async function setClipboardText(text) {
  // Strategy 1: navigator.clipboard.writeText
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {}

  // Strategy 2: Synchronous DOM copy on helper textarea
  try {
    const helper = document.getElementById('clipboardHelper');
    if (helper) {
      helper.value = text;
      helper.focus();
      helper.select();
      const ok = document.execCommand('copy');
      helper.value = '';
      if (ok) return true;
    }
  } catch (_) {}

  // Strategy 3: Offscreen document in background service worker
  try {
    const res = await chrome.runtime.sendMessage({ action: 'WRITE_CLIPBOARD', text });
    if (res && res.success) return true;
  } catch (_) {}

  // Strategy 4: Active tab script execution
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (str) => {
          navigator.clipboard.writeText(str);
        },
        args: [text]
      });
      return true;
    }
  } catch (_) {}

  return false;
}

function attachEvents() {
  // Open Side Panel
  openSidePanelBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  });

  // Quick Sanitize Clipboard
  quickSanitizeClipboardBtn.addEventListener('click', async () => {
    try {
      const text = await getClipboardText();
      if (!text || !text.trim()) {
        showBtnFeedback(quickSanitizeClipboardBtn, 'Clipboard is empty!');
        return;
      }

      await vault.loadFromStorage();
      const res = await chrome.storage.local.get('smart_pii_settings');
      settings = res.smart_pii_settings || settings;

      const { sanitizedText, stats } = sanitize(text, {
        vault,
        sensitivity: settings.sensitivity,
        enableNames: settings.enableNames,
        allowlist: settings.allowlist,
        customRules: settings.customRules,
        enabledCategories: settings.enabledCategories
      });

      await vault.saveToStorage();
      await setClipboardText(sanitizedText);

      if (stats.total > 0) {
        showBtnFeedback(quickSanitizeClipboardBtn, `✓ Sanitized ${stats.total} item(s)!`);
      } else {
        showBtnFeedback(quickSanitizeClipboardBtn, `✓ Clean (0 sensitive items)`);
      }
      vaultItemCount.textContent = vault.getAllEntries().length.toString();
    } catch (err) {
      console.error('Clipboard sanitize error:', err);
      showBtnFeedback(quickSanitizeClipboardBtn, 'Clipboard access error');
    }
  });

  // Quick Reverse-Map Clipboard
  quickReverseClipboardBtn.addEventListener('click', async () => {
    try {
      const text = await getClipboardText();
      if (!text || !text.trim()) {
        showBtnFeedback(quickReverseClipboardBtn, 'Clipboard is empty!');
        return;
      }

      await vault.loadFromStorage();
      const { restoredText, restoredCount } = reverseMap(text, vault);
      await setClipboardText(restoredText);

      if (restoredCount > 0) {
        showBtnFeedback(quickReverseClipboardBtn, `✓ Restored ${restoredCount} item(s)!`);
      } else {
        showBtnFeedback(quickReverseClipboardBtn, `0 dummy tokens found`);
      }
    } catch (err) {
      console.error('Clipboard reverse error:', err);
      showBtnFeedback(quickReverseClipboardBtn, 'Clipboard access error');
    }
  });

  // Auto-sanitize toggle
  autoSanitizeToggle.addEventListener('change', async () => {
    settings.autoSanitizePaste = autoSanitizeToggle.checked;
    await chrome.storage.local.set({ smart_pii_settings: settings });
  });

  // Open Options page
  openOptionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
}

function showBtnFeedback(btn, msg) {
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = original;
  }, 1400);
}

document.addEventListener('DOMContentLoaded', init);
