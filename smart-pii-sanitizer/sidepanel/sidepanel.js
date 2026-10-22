/**
 * Smart PII Sanitizer - Side Panel Controller (v2.0 Hardened)
 * Real-time mirrored overlay, red sensitive flagging, residual scan,
 * SVG icon buttons with feedback, Reverse Map diagnostics.
 */

import { sanitize } from '../core/sanitizer.js';
import { reverseMap } from '../core/reverse.js';
import { Vault } from '../core/vault.js';

let vault = new Vault();
let settings = {
  sensitivity: 'balanced',
  enableNames: false,
  allowlist: [],
  customRules: [],
  enabledCategories: {}
};

const excludedEntityIds = new Set();
let debounceTimer = null;
let lastSanitizedInput = null;
let lastReversedAiInput = null;

// DOM Elements
const rawInput = document.getElementById('rawInput');
const rawInputBackdrop = document.getElementById('rawInputBackdrop');
const sanitizedOutput = document.getElementById('sanitizedOutput');
const sanitizedOutputBackdrop = document.getElementById('sanitizedOutputBackdrop');
const outOfDateBadge = document.getElementById('outOfDateBadge');

const sanitizeBtn = document.getElementById('sanitizeBtn');
const copySanitizedBtn = document.getElementById('copySanitizedBtn');
const pasteClipboardBtn = document.getElementById('pasteClipboardBtn');
const clearInputBtn = document.getElementById('clearInputBtn');

const liveSummary = document.getElementById('liveSummary');
const summaryText = document.getElementById('summaryText');
const entityBadges = document.getElementById('entityBadges');
const residualAlert = document.getElementById('residualAlert');

const aiResponseInput = document.getElementById('aiResponseInput');
const aiResponseBackdrop = document.getElementById('aiResponseBackdrop');
const restoredOutput = document.getElementById('restoredOutput');
const restoredOutputBackdrop = document.getElementById('restoredOutputBackdrop');
const reverseOutOfDateBadge = document.getElementById('reverseOutOfDateBadge');

const reverseMapBtn = document.getElementById('reverseMapBtn');
const copyRestoredBtn = document.getElementById('copyRestoredBtn');
const pasteAiReplyBtn = document.getElementById('pasteAiReplyBtn');
const clearAiReplyBtn = document.getElementById('clearAiReplyBtn');
const reverseStatusBanner = document.getElementById('reverseStatusBanner');
const reversePlaceholderChips = document.getElementById('reversePlaceholderChips');

const vaultBadge = document.getElementById('vaultBadge');
const vaultTableBody = document.getElementById('vaultTableBody');
const clearVaultBtn = document.getElementById('clearVaultBtn');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const clipboardLiveRegion = document.getElementById('clipboardLiveRegion');
const toastMessage = document.getElementById('toastMessage');

// HTML Escape helper
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Category to severity class
function getSeverityLevel(category) {
  switch (category) {
    case 'SECRETS':
      return 'badge-severity-high';
    case 'EMAIL':
    case 'CONTACT':
    case 'ID_CARDS':
    case 'FINANCIAL':
      return 'badge-severity-medium';
    case 'NETWORK':
    case 'SYSTEM':
    case 'HOST':
    default:
      return 'badge-severity-low';
  }
}

function getHighlightClass(category) {
  switch (category) {
    case 'SECRETS':
      return 'hl-secret';
    case 'EMAIL':
    case 'CONTACT':
    case 'ID_CARDS':
    case 'FINANCIAL':
      return 'hl-id';
    case 'NETWORK':
    case 'SYSTEM':
    case 'HOST':
    default:
      return 'hl-network';
  }
}

// Initialize
async function init() {
  await vault.loadFromStorage();
  await loadSettings();
  initTheme();
  updateVaultUI();
  attachEvents();
}

// Load settings
async function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const res = await chrome.storage.local.get('smart_pii_settings');
      if (res && res.smart_pii_settings) {
        settings = res.smart_pii_settings;
      }
    } catch (e) {
      console.warn('[Smart PII Sanitizer] Failed to load settings:', e);
    }
  }
}

// Theme handling
async function initTheme() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get('smart_pii_theme');
    if (res && res.smart_pii_theme === 'light') {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
    }
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('theme-light');
  if (isLight) {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
    chrome.storage?.local?.set({ smart_pii_theme: 'dark' });
  } else {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
    chrome.storage?.local?.set({ smart_pii_theme: 'light' });
  }
}

// Tab navigation
function switchTab(tabId) {
  tabButtons.forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });
}

// Synchronized scrolling for mirrored backdrop
function syncScroll(textarea, backdrop) {
  if (!backdrop) return;
  backdrop.scrollTop = textarea.scrollTop;
  backdrop.scrollLeft = textarea.scrollLeft;
}

// Build mirrored HTML backdrop with safe highlights (capped to protect layout engine)
function renderMirroredBackdrop(text, spans, backdropEl) {
  if (!backdropEl) return;
  if (!text) {
    backdropEl.innerHTML = '';
    return;
  }

  // Large input safeguard: if text exceeds 120KB (~2500 lines) or spans > 300,
  // do NOT overwhelm browser layout engine with thousands of DOM nodes.
  if (text.length > 120000 || (spans && spans.length > 300)) {
    const safeSpans = (spans || []).slice(0, 150);
    renderPartialBackdrop(text, safeSpans, backdropEl, true);
    return;
  }

  if (!spans || spans.length === 0) {
    backdropEl.innerHTML = escapeHtml(text) + '\n';
    return;
  }

  renderPartialBackdrop(text, spans, backdropEl, false);
}

function renderPartialBackdrop(text, spans, backdropEl, isTruncated = false) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;

  for (const span of sorted) {
    if (span.start > cursor) {
      html += escapeHtml(text.slice(cursor, span.start));
    }
    const matched = text.slice(span.start, span.end);
    const hlClass = span.hlClass || 'hl-secret';
    html += `<mark class="hl-span ${hlClass}">${escapeHtml(matched)}</mark>`;
    cursor = span.end;
  }

  if (cursor < text.length) {
    if (isTruncated && text.length - cursor > 15000) {
      html += escapeHtml(text.slice(cursor, cursor + 15000)) + '\n...';
    } else {
      html += escapeHtml(text.slice(cursor));
    }
  }

  backdropEl.innerHTML = html + '\n';
}

// Attach UI listeners
function attachEvents() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  themeToggleBtn.addEventListener('click', toggleTheme);

  openSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  // Mirrored scrolling
  rawInput.addEventListener('scroll', () => syncScroll(rawInput, rawInputBackdrop));
  sanitizedOutput.addEventListener('scroll', () => syncScroll(sanitizedOutput, sanitizedOutputBackdrop));
  aiResponseInput.addEventListener('scroll', () => syncScroll(aiResponseInput, aiResponseBackdrop));
  restoredOutput.addEventListener('scroll', () => syncScroll(restoredOutput, restoredOutputBackdrop));

  // Live input changes (with large file safety)
  rawInput.addEventListener('input', () => {
    checkSanitizeOutOfDate();
    clearTimeout(debounceTimer);
    const text = rawInput.value;
    if (text.length > 80000) {
      showLargeInputNotice(text);
      return;
    }
    debounceTimer = setTimeout(runLivePreview, 200);
  });

  aiResponseInput.addEventListener('input', () => {
    checkReverseOutOfDate();
    renderAiResponseHighlights();
  });

  // Action Buttons
  sanitizeBtn.addEventListener('click', executeSanitize);
  copySanitizedBtn.addEventListener('click', () => copyToClipboard(sanitizedOutput.value, copySanitizedBtn));

  pasteClipboardBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      rawInput.value = text;
      checkSanitizeOutOfDate();
      runLivePreview();
    } catch {
      rawInput.focus();
      document.execCommand('paste');
    }
  });

  clearInputBtn.addEventListener('click', () => {
    rawInput.value = '';
    rawInputBackdrop.innerHTML = '';
    sanitizedOutput.value = '';
    sanitizedOutputBackdrop.innerHTML = '';
    liveSummary.classList.add('hidden');
    residualAlert.classList.add('hidden');
    outOfDateBadge.classList.add('hidden');
    sanitizedOutput.parentElement.classList.remove('out-of-date');
    excludedEntityIds.clear();
    lastSanitizedInput = null;
  });

  // Reverse Map Tab
  reverseMapBtn.addEventListener('click', executeReverseMap);
  copyRestoredBtn.addEventListener('click', () => copyToClipboard(restoredOutput.value, copyRestoredBtn));

  pasteAiReplyBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      aiResponseInput.value = text;
      checkReverseOutOfDate();
      renderAiResponseHighlights();
    } catch {
      aiResponseInput.focus();
      document.execCommand('paste');
    }
  });

  clearAiReplyBtn.addEventListener('click', () => {
    aiResponseInput.value = '';
    aiResponseBackdrop.innerHTML = '';
    restoredOutput.value = '';
    restoredOutputBackdrop.innerHTML = '';
    reverseStatusBanner.classList.add('hidden');
    reversePlaceholderChips.classList.add('hidden');
    reverseOutOfDateBadge.classList.add('hidden');
    restoredOutput.parentElement.classList.remove('out-of-date');
    lastReversedAiInput = null;
  });

  // Vault Tab
  clearVaultBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all session vault mappings? Reverse mapping previously sanitized text will no longer be possible.')) {
      vault.clear();
      await vault.saveToStorage();
      updateVaultUI();
      showToast('Vault cleared');
    }
  });
}

// Out of date detection
function checkSanitizeOutOfDate() {
  if (lastSanitizedInput !== null && rawInput.value !== lastSanitizedInput) {
    outOfDateBadge.classList.remove('hidden');
    sanitizedOutput.parentElement.classList.add('out-of-date');
  } else {
    outOfDateBadge.classList.add('hidden');
    sanitizedOutput.parentElement.classList.remove('out-of-date');
  }
}

function checkReverseOutOfDate() {
  if (lastReversedAiInput !== null && aiResponseInput.value !== lastReversedAiInput) {
    reverseOutOfDateBadge.classList.remove('hidden');
    restoredOutput.parentElement.classList.add('out-of-date');
  } else {
    reverseOutOfDateBadge.classList.add('hidden');
    restoredOutput.parentElement.classList.remove('out-of-date');
  }
}

function showLargeInputNotice(text) {
  const lineCount = (text.match(/\n/g) || []).length + 1;
  const sizeKb = (text.length / 1024).toFixed(1);
  liveSummary.classList.remove('hidden');
  liveSummary.className = 'summary-bar summary-blue';
  summaryText.innerHTML = `⚡ <strong>Large Code Detected:</strong> ${lineCount.toLocaleString()} lines (${sizeKb} KB). High-Performance Mode active. Click <strong>"Sanitize"</strong> button to run.`;
  entityBadges.innerHTML = '';
  rawInputBackdrop.innerHTML = '';
}

// Live preview scan
function runLivePreview() {
  const text = rawInput.value;
  if (!text.trim()) {
    liveSummary.classList.add('hidden');
    rawInputBackdrop.innerHTML = '';
    return;
  }

  if (text.length > 80000) {
    showLargeInputNotice(text);
    return;
  }

  // Dry run scan using temporary vault clone
  const preview = sanitize(text, {
    vault: new Vault(),
    sensitivity: settings.sensitivity,
    enableNames: settings.enableNames,
    allowlist: settings.allowlist,
    customRules: settings.customRules,
    enabledCategories: settings.enabledCategories,
    excludedEntityIds: Array.from(excludedEntityIds)
  });

  // Render highlights in mirrored backdrop
  const spans = preview.entities.map(e => ({
    start: e.start,
    end: e.end,
    hlClass: getHighlightClass(e.category)
  }));
  renderMirroredBackdrop(text, spans, rawInputBackdrop);

  if (preview.stats.total === 0) {
    liveSummary.classList.remove('hidden');
    liveSummary.className = 'summary-bar';
    summaryText.textContent = 'No sensitive data detected in input.';
    entityBadges.innerHTML = '';
    return;
  }

  // Turn live summary banner red
  liveSummary.classList.remove('hidden');
  liveSummary.className = 'summary-bar summary-red';

  const catCounts = preview.stats.byCategory;
  const catEntries = Object.entries(catCounts)
    .map(([cat, count]) => `${count} ${cat.toLowerCase()}`)
    .join(', ');
  summaryText.textContent = `Found ${preview.stats.total} sensitive item(s) (${catEntries}):`;

  entityBadges.innerHTML = '';
  const maxBadges = 40;
  const visibleEntities = preview.entities.slice(0, maxBadges);

  visibleEntities.forEach(entity => {
    const badge = document.createElement('span');
    const isExcluded = excludedEntityIds.has(entity.id) || excludedEntityIds.has(entity.rawValue);
    const severityClass = getSeverityLevel(entity.category);

    badge.className = `entity-badge ${severityClass} ${isExcluded ? 'excluded' : ''}`;
    badge.title = isExcluded ? 'Excluded from sanitization (click to re-include)' : 'Click to jump to span';

    badge.innerHTML = `
      <span>${escapeHtml(entity.type)}: ${escapeHtml(entity.rawValue)}</span>
      <button class="badge-toggle-btn" title="${isExcluded ? 'Include' : 'Exclude'}">${isExcluded ? '+' : '✕'}</button>
    `;

    // Click badge body to jump to and highlight span in input
    badge.addEventListener('click', (e) => {
      if (e.target.classList.contains('badge-toggle-btn')) {
        // Toggle exclusion
        if (isExcluded) {
          excludedEntityIds.delete(entity.id);
          excludedEntityIds.delete(entity.rawValue);
        } else {
          excludedEntityIds.add(entity.id);
          excludedEntityIds.add(entity.rawValue);
        }
        runLivePreview();
        return;
      }

      // Jump to and select span in input
      rawInput.focus();
      rawInput.setSelectionRange(entity.start, entity.end);
      syncScroll(rawInput, rawInputBackdrop);
    });

    entityBadges.appendChild(badge);
  });

  if (preview.entities.length > maxBadges) {
    const morePill = document.createElement('span');
    morePill.className = 'entity-badge badge-severity-low';
    morePill.textContent = `+${(preview.entities.length - maxBadges).toLocaleString()} more sensitive items...`;
    entityBadges.appendChild(morePill);
  }
}

// Perform full sanitization
async function executeSanitize() {
  const text = rawInput.value;
  if (!text.trim()) return;

  // Immediate visual feedback with spinner
  sanitizeBtn.disabled = true;
  const originalBtnHtml = sanitizeBtn.innerHTML;
  sanitizeBtn.innerHTML = `
    <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
    </svg>
    <span>Sanitizing...</span>
  `;

  // Yield to allow browser to render loading state
  await new Promise(resolve => setTimeout(resolve, 20));

  try {
    const result = sanitize(text, {
      vault,
      sensitivity: settings.sensitivity,
      enableNames: settings.enableNames,
      allowlist: settings.allowlist,
      customRules: settings.customRules,
      enabledCategories: settings.enabledCategories,
      excludedEntityIds: Array.from(excludedEntityIds)
    });

    sanitizedOutput.value = result.sanitizedText;
    lastSanitizedInput = text;
    checkSanitizeOutOfDate();

    // Render placeholder badges in sanitized output backdrop
    const placeholderSpans = result.entities.map(e => ({
      start: e.sanitizedStart !== undefined ? e.sanitizedStart : result.sanitizedText.indexOf(e.placeholder),
      end: e.sanitizedEnd !== undefined ? e.sanitizedEnd : (result.sanitizedText.indexOf(e.placeholder) + e.placeholder.length),
      hlClass: 'hl-placeholder'
    })).filter(s => s.start !== -1);
    renderMirroredBackdrop(result.sanitizedText, placeholderSpans, sanitizedOutputBackdrop);

    // Update live summary
    liveSummary.classList.remove('hidden');
    liveSummary.className = 'summary-bar summary-red';
    const catCounts = result.stats.byCategory;
    const catEntries = Object.entries(catCounts)
      .map(([cat, count]) => `${count} ${cat.toLowerCase()}`)
      .join(', ');
    const lineCount = (result.sanitizedText.match(/\n/g) || []).length + 1;
    summaryText.textContent = `Sanitized ${result.stats.total} item(s) across ${lineCount.toLocaleString()} lines (${result.stats.durationMs}ms):`;

    entityBadges.innerHTML = '';
    const maxBadges = 40;
    result.entities.slice(0, maxBadges).forEach(entity => {
      const badge = document.createElement('span');
      const isExcluded = excludedEntityIds.has(entity.id) || excludedEntityIds.has(entity.rawValue);
      const severityClass = getSeverityLevel(entity.category);

      badge.className = `entity-badge ${severityClass} ${isExcluded ? 'excluded' : ''}`;
      badge.innerHTML = `<span>${escapeHtml(entity.type)}: ${escapeHtml(entity.rawValue)}</span>`;
      entityBadges.appendChild(badge);
    });

    if (result.entities.length > maxBadges) {
      const morePill = document.createElement('span');
      morePill.className = 'entity-badge badge-severity-low';
      morePill.textContent = `+${(result.entities.length - maxBadges).toLocaleString()} more sensitive items`;
      entityBadges.appendChild(morePill);
    }

    // Residual Scan Banner (CASE 12)
    if (result.residualFindings && result.residualFindings.length > 0) {
      residualAlert.classList.remove('hidden');
      residualAlert.className = 'residual-banner warning-red';
      const types = Array.from(new Set(result.residualFindings.map(r => r.type))).join(', ');
      residualAlert.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>Warning: ${result.residualFindings.length} possible sensitive item(s) remain in output (${escapeHtml(types)}). Review before sending.</span>
      `;
    } else {
      residualAlert.classList.remove('hidden');
      residualAlert.className = 'residual-banner clean-green';
      residualAlert.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>0 sensitive items remaining (All clear). Processed in ${result.stats.durationMs}ms.</span>
      `;
    }

    await vault.saveToStorage();
    updateVaultUI();
  } finally {
    sanitizeBtn.disabled = false;
    sanitizeBtn.innerHTML = originalBtnHtml;
  }
}

// Render highlights for AI reply input
function renderAiResponseHighlights() {
  const text = aiResponseInput.value;
  if (!text) {
    aiResponseBackdrop.innerHTML = '';
    return;
  }

  // Fast limit for large AI text
  if (text.length > 100000) {
    aiResponseBackdrop.innerHTML = '';
    return;
  }

  const entries = vault.getAllEntries();
  const spans = [];
  const maxSpans = 200;

  for (const entry of entries) {
    const pl = entry.placeholder;
    let idx = 0;
    while ((idx = text.indexOf(pl, idx)) !== -1) {
      spans.push({
        start: idx,
        end: idx + pl.length,
        hlClass: 'hl-placeholder'
      });
      idx += pl.length;
      if (spans.length >= maxSpans) break;
    }
    if (spans.length >= maxSpans) break;
  }

  renderMirroredBackdrop(text, spans, aiResponseBackdrop);
}

// Perform reverse mapping
async function executeReverseMap() {
  const text = aiResponseInput.value;
  if (!text.trim()) return;

  reverseMapBtn.disabled = true;
  const originalBtnHtml = reverseMapBtn.innerHTML;
  reverseMapBtn.innerHTML = `
    <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
    </svg>
    <span>Restoring...</span>
  `;

  await new Promise(resolve => setTimeout(resolve, 20));

  try {
    await vault.loadFromStorage();
    const res = reverseMap(text, vault);

    restoredOutput.value = res.restoredText;
    lastReversedAiInput = text;
    checkReverseOutOfDate();

    // Highlight restored values in restored output backdrop (capped for performance)
    const restoredSpans = [];
    const maxSpans = 150;
    for (const detail of res.details) {
      let idx = 0;
      while ((idx = res.restoredText.indexOf(detail.realValue, idx)) !== -1) {
        restoredSpans.push({
          start: idx,
          end: idx + detail.realValue.length,
          hlClass: 'hl-restored'
        });
        idx += detail.realValue.length;
        if (restoredSpans.length >= maxSpans) break;
      }
      if (restoredSpans.length >= maxSpans) break;
    }
    renderMirroredBackdrop(res.restoredText, restoredSpans, restoredOutputBackdrop);

    // Reverse Status Banner
    reverseStatusBanner.classList.remove('hidden');
    const unmatchedCount = res.unmatchedPlaceholders.length;

    if (unmatchedCount > 0) {
      reverseStatusBanner.className = 'status-banner warning';
      reverseStatusBanner.textContent = `Found ${res.restoredCount + unmatchedCount} placeholder(s): ${res.restoredCount} restored, ${unmatchedCount} unmatched.`;
    } else {
      reverseStatusBanner.className = 'status-banner';
      reverseStatusBanner.textContent = `Found ${res.restoredCount} placeholder(s): ${res.restoredCount} restored, 0 unmatched.`;
    }

    // Reverse Placeholder Chips (cap DOM count to 40)
    reversePlaceholderChips.classList.remove('hidden');
    reversePlaceholderChips.innerHTML = '';

    const maxChips = 40;
    const visibleDetails = res.details.slice(0, maxChips);

    // Restored tokens
    for (const detail of visibleDetails) {
      const chip = document.createElement('div');
      chip.className = 'reverse-chip';
      chip.innerHTML = `
        <strong>${escapeHtml(detail.placeholder)}</strong>
        <span>→</span>
        <span class="masked-val" title="Click to reveal">••••••••</span>
      `;
      const valEl = chip.querySelector('.masked-val');
      let revealed = false;
      valEl.addEventListener('click', () => {
        revealed = !revealed;
        valEl.textContent = revealed ? detail.realValue : '••••••••';
        valEl.classList.toggle('revealed', revealed);
      });
      reversePlaceholderChips.appendChild(chip);
    }

    if (res.details.length > maxChips) {
      const morePill = document.createElement('div');
      morePill.className = 'reverse-chip';
      morePill.textContent = `+${(res.details.length - maxChips).toLocaleString()} more restored tokens`;
      reversePlaceholderChips.appendChild(morePill);
    }

    // Unmatched tokens
    if (res.unmatchedDetails) {
      for (const item of res.unmatchedDetails.slice(0, 20)) {
        const chip = document.createElement('div');
        chip.className = 'reverse-chip unmatched';
        chip.innerHTML = `
          <strong>${escapeHtml(item.token)}</strong>
          <span class="hint-text">${item.hint ? escapeHtml(item.hint) : 'unmatched in vault'}</span>
        `;
        reversePlaceholderChips.appendChild(chip);
      }
    }
  } finally {
    reverseMapBtn.disabled = false;
    reverseMapBtn.innerHTML = originalBtnHtml;
  }
}

// Update Vault UI
function updateVaultUI() {
  const entries = vault.getAllEntries();
  vaultBadge.textContent = entries.length.toString();

  if (entries.length === 0) {
    vaultTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">Vault is currently empty. Sanitize text to populate.</td>
      </tr>
    `;
    return;
  }

  vaultTableBody.innerHTML = '';
  entries.forEach(entry => {
    const tr = document.createElement('tr');

    const tdPlaceholder = document.createElement('td');
    tdPlaceholder.textContent = entry.placeholder;

    const tdReal = document.createElement('td');
    tdReal.className = 'masked-val';
    tdReal.textContent = '••••••••••••';
    tdReal.title = 'Click to reveal real value';
    let revealed = false;
    tdReal.addEventListener('click', () => {
      revealed = !revealed;
      tdReal.textContent = revealed ? entry.realValue : '••••••••••••';
      tdReal.classList.toggle('revealed', revealed);
    });

    const tdType = document.createElement('td');
    tdType.textContent = entry.type;

    const tdAction = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-row';
    delBtn.title = 'Delete this mapping';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async () => {
      vault.deleteEntry(entry.placeholder);
      await vault.saveToStorage();
      updateVaultUI();
    });
    tdAction.appendChild(delBtn);

    tr.appendChild(tdPlaceholder);
    tr.appendChild(tdReal);
    tr.appendChild(tdType);
    tr.appendChild(tdAction);

    vaultTableBody.appendChild(tr);
  });
}

// Copy to clipboard with SVG icon swap and toast feedback
async function copyToClipboard(text, btn) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // Swap icon to checkmark
  const copyIcon = btn.querySelector('.copy-icon');
  const checkIcon = btn.querySelector('.check-icon');
  if (copyIcon && checkIcon) {
    copyIcon.classList.add('hidden');
    checkIcon.classList.remove('hidden');
    btn.classList.add('copied');
  }

  showToast('Copied to clipboard');
  announceAccessibility('Text copied to clipboard');

  setTimeout(() => {
    if (copyIcon && checkIcon) {
      copyIcon.classList.remove('hidden');
      checkIcon.classList.add('hidden');
      btn.classList.remove('copied');
    }
  }, 1500);
}

// Toast notification
let toastTimer = null;
function showToast(msg) {
  if (!toastMessage) return;
  toastMessage.textContent = msg;
  toastMessage.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.classList.add('hidden');
  }, 1500);
}

function announceAccessibility(msg) {
  if (clipboardLiveRegion) {
    clipboardLiveRegion.textContent = msg;
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
