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
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const { sanitizedText, stats } = sanitize(text, {
        vault,
        sensitivity: settings.sensitivity,
        enableNames: settings.enableNames,
        allowlist: settings.allowlist,
        customRules: settings.customRules,
        enabledCategories: settings.enabledCategories
      });

      await vault.saveToStorage();
      await navigator.clipboard.writeText(sanitizedText);
      showBtnFeedback(quickSanitizeClipboardBtn, `Sanitized ${stats.total} item(s)!`);
      vaultItemCount.textContent = vault.getAllEntries().length.toString();
    } catch (err) {
      console.warn('Clipboard sanitize error:', err);
    }
  });

  // Quick Reverse-Map Clipboard
  quickReverseClipboardBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      await vault.loadFromStorage();
      const { restoredText, restoredCount } = reverseMap(text, vault);
      await navigator.clipboard.writeText(restoredText);
      showBtnFeedback(quickReverseClipboardBtn, `Restored ${restoredCount} item(s)!`);
    } catch (err) {
      console.warn('Clipboard reverse error:', err);
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
