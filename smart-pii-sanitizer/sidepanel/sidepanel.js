/**
 * Smart PII Sanitizer - Side Panel Controller (v2.1 Tolerant & Assisted Mapping)
 * Real-time mirrored overlay, red sensitive flagging, residual scan,
 * SVG icon buttons with feedback, Reverse Map health check strip,
 * unrecognized redaction token detection, assisted manual mapping modal,
 * and diagnostic AI test tool.
 */

import { sanitize, buildLlmInstructionHeader } from '../core/sanitizer.js';
import { reverseMap, inferCategoryFromToken } from '../core/reverse.js';
import { Vault, maskRealValue } from '../core/vault.js';

let vault = new Vault();
let settings = {
  sensitivity: 'balanced',
  enableNames: false,
  allowlist: [],
  customRules: [],
  enabledCategories: {},
  placeholderStyles: {}
};

const excludedEntityIds = new Set();
let debounceTimer = null;
let lastSanitizedInput = null;
let lastSanitizedResult = null;
let lastReversedAiInput = null;
let currentMappingToken = null;
let currentMappingCandidatePl = null;

// DOM Elements - Navigation & Theme
const themeToggleBtn = document.getElementById('themeToggleBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const vaultBadge = document.getElementById('vaultBadge');

// DOM Elements - Tab 1: Sanitize
const rawInput = document.getElementById('rawInput');
const rawInputBackdrop = document.getElementById('rawInputBackdrop');
const sanitizedOutput = document.getElementById('sanitizedOutput');
const sanitizedOutputBackdrop = document.getElementById('sanitizedOutputBackdrop');
const outOfDateBadge = document.getElementById('outOfDateBadge');

const sanitizeBtn = document.getElementById('sanitizeBtn');
const copySanitizedBtn = document.getElementById('copySanitizedBtn');
const pasteClipboardBtn = document.getElementById('pasteClipboardBtn');
const clearInputBtn = document.getElementById('clearInputBtn');

const addInstructionToggle = document.getElementById('addInstructionToggle');
const instructionHint = document.getElementById('instructionHint');

const liveSummary = document.getElementById('liveSummary');
const summaryText = document.getElementById('summaryText');
const entityBadges = document.getElementById('entityBadges');
const residualAlert = document.getElementById('residualAlert');

// DOM Elements - Tab 2: Reverse Map
const aiResponseInput = document.getElementById('aiResponseInput');
const aiResponseBackdrop = document.getElementById('aiResponseBackdrop');
const restoredOutput = document.getElementById('restoredOutput');
const restoredOutputBackdrop = document.getElementById('restoredOutputBackdrop');
const reverseOutOfDateBadge = document.getElementById('reverseOutOfDateBadge');

const reverseMapBtn = document.getElementById('reverseMapBtn');
const copyRestoredBtn = document.getElementById('copyRestoredBtn');
const pasteAiReplyBtn = document.getElementById('pasteAiReplyBtn');
const clearAiReplyBtn = document.getElementById('clearAiReplyBtn');

const healthCheckStrip = document.getElementById('healthCheckStrip');
const healthIssued = document.getElementById('healthIssued');
const healthFound = document.getElementById('healthFound');
const healthRestored = document.getElementById('healthRestored');
const healthMissing = document.getElementById('healthMissing');
const healthUnrecognized = document.getElementById('healthUnrecognized');
const healthDetailsContainer = document.getElementById('healthDetailsContainer');

const unrecognizedTokensSection = document.getElementById('unrecognizedTokensSection');
const unrecognizedTokensList = document.getElementById('unrecognizedTokensList');
const reverseStatusBanner = document.getElementById('reverseStatusBanner');
const reversePlaceholderChips = document.getElementById('reversePlaceholderChips');

// DOM Elements - Tab 3: Vault & Aliases
const clearVaultBtn = document.getElementById('clearVaultBtn');
const vaultTableBody = document.getElementById('vaultTableBody');
const aliasesTableBody = document.getElementById('aliasesTableBody');
const clearAliasesBtn = document.getElementById('clearAliasesBtn');
const generateAiTestBlockBtn = document.getElementById('generateAiTestBlockBtn');
const aiTestBlockContainer = document.getElementById('aiTestBlockContainer');
const aiTestPromptText = document.getElementById('aiTestPromptText');
const copyAiTestPromptBtn = document.getElementById('copyAiTestPromptBtn');

// DOM Elements - Assisted Mapping Modal
const mappingPopoverModal = document.getElementById('mappingPopoverModal');
const closeMappingModalBtn = document.getElementById('closeMappingModalBtn');
const cancelMappingBtn = document.getElementById('cancelMappingBtn');
const confirmMappingBtn = document.getElementById('confirmMappingBtn');
const popoverTokenLabel = document.getElementById('popoverTokenLabel');
const popoverCategoryLabel = document.getElementById('popoverCategoryLabel');
const popoverCandidatesList = document.getElementById('popoverCandidatesList');

// Toast & Live Region
const clipboardLiveRegion = document.getElementById('clipboardLiveRegion');
const toastMessage = document.getElementById('toastMessage');

// Severity map for visual hierarchy
function getSeverityLevel(category) {
  switch (category) {
    case 'SECRETS':
      return 'badge-severity-critical';
    case 'FINANCIAL':
    case 'ID_CARDS':
      return 'badge-severity-high';
    case 'NETWORK':
    case 'CONTACT':
      return 'badge-severity-medium';
    default:
      return 'badge-severity-low';
  }
}

// Map detector category to backdrop highlight CSS class
function getHighlightClass(category) {
  switch (category) {
    case 'SECRETS':
      return 'hl-secrets';
    case 'FINANCIAL':
      return 'hl-financial';
    case 'ID_CARDS':
      return 'hl-idcards';
    case 'NETWORK':
      return 'hl-network';
    case 'CONTACT':
      return 'hl-contact';
    case 'EMAIL':
      return 'hl-email';
    default:
      return 'hl-entity';
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirrored backdrop highlighter
function renderMirroredBackdrop(text, spans, container) {
  if (!container) return;

  if (!text || spans.length === 0) {
    container.textContent = text || '';
    return;
  }

  // Cap number of visual highlights to keep 60 FPS
  const maxHighlights = 300;
  const limitedSpans = spans.slice(0, maxHighlights);

  limitedSpans.sort((a, b) => a.start - b.start);

  let html = '';
  let cursor = 0;

  for (const span of limitedSpans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      html += escapeHtml(text.slice(cursor, span.start));
    }
    const chunk = text.slice(span.start, span.end);
    html += `<span class="${span.hlClass}">${escapeHtml(chunk)}</span>`;
    cursor = span.end;
  }

  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }

  container.innerHTML = html;
}

// Synchronize scroll between textarea and its backdrop
function syncScroll(textarea, backdrop) {
  if (!textarea || !backdrop) return;
  backdrop.scrollTop = textarea.scrollTop;
  backdrop.scrollLeft = textarea.scrollLeft;
}

// Initialize application
async function init() {
  await loadSettings();
  await vault.loadFromStorage();
  updateVaultUI();

  // Load saved theme
  const savedTheme = localStorage.getItem('smart_pii_theme') || 'dark';
  applyTheme(savedTheme);

  // Load instruction toggle state
  const savedToggle = localStorage.getItem('smart_pii_add_instruction');
  if (addInstructionToggle) {
    addInstructionToggle.checked = savedToggle === 'true';
  }

  setupEventListeners();
  setupSyncScroll();
}

async function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get('smart_pii_settings');
      if (stored && stored.smart_pii_settings) {
        settings = { ...settings, ...stored.smart_pii_settings };
      }
    } catch {
      // Use defaults
    }
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  }
  localStorage.setItem('smart_pii_theme', theme);
}

function setupSyncScroll() {
  const pairs = [
    [rawInput, rawInputBackdrop],
    [sanitizedOutput, sanitizedOutputBackdrop],
    [aiResponseInput, aiResponseBackdrop],
    [restoredOutput, restoredOutputBackdrop]
  ];

  pairs.forEach(([ta, bd]) => {
    if (!ta || !bd) return;
    ta.addEventListener('scroll', () => syncScroll(ta, bd));
  });
}

function setupEventListeners() {
  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    applyTheme(isDark ? 'light' : 'dark');
  });

  // Settings page
  openSettingsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/options.html', '_blank');
    }
  });

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      if (targetId === 'vaultTab') {
        updateVaultUI();
      }
    });
  });

  // Instruction Toggle Change
  if (addInstructionToggle) {
    addInstructionToggle.addEventListener('change', () => {
      localStorage.setItem('smart_pii_add_instruction', addInstructionToggle.checked ? 'true' : 'false');
    });
  }

  // Real-time debounce scanning
  rawInput.addEventListener('input', () => {
    checkSanitizeOutOfDate();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runLivePreview, 150);
  });

  // Sanitize Tab Actions
  sanitizeBtn.addEventListener('click', executeSanitize);

  copySanitizedBtn.addEventListener('click', () => {
    let textToCopy = sanitizedOutput.value;
    if (addInstructionToggle && addInstructionToggle.checked && lastSanitizedResult) {
      const header = buildLlmInstructionHeader(lastSanitizedResult.entities || []);
      if (header) {
        textToCopy = `${header}\n\n${textToCopy}`;
      }
    }
    copyToClipboard(textToCopy, copySanitizedBtn);
  });

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
    lastSanitizedInput = null;
    lastSanitizedResult = null;
  });

  // Reverse Map Tab Actions
  aiResponseInput.addEventListener('input', () => {
    checkReverseOutOfDate();
    renderAiResponseHighlights();
  });

  reverseMapBtn.addEventListener('click', executeReverseMap);

  copyRestoredBtn.addEventListener('click', () => {
    copyToClipboard(restoredOutput.value, copyRestoredBtn);
  });

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
    if (healthCheckStrip) healthCheckStrip.classList.add('hidden');
    if (unrecognizedTokensSection) unrecognizedTokensSection.classList.add('hidden');
    reverseStatusBanner.classList.add('hidden');
    reversePlaceholderChips.classList.add('hidden');
    reverseOutOfDateBadge.classList.add('hidden');
    restoredOutput.parentElement.classList.remove('out-of-date');
    lastReversedAiInput = null;
  });

  // Vault Tab Actions
  clearVaultBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all session vault mappings and aliases?')) {
      vault.clear();
      await vault.saveToStorage();
      updateVaultUI();
      showToast('Vault and aliases cleared');
    }
  });

  if (clearAliasesBtn) {
    clearAliasesBtn.addEventListener('click', async () => {
      vault.clearAliases();
      await vault.saveToStorage();
      updateVaultUI();
      showToast('Session aliases cleared');
    });
  }

  // Diagnostic AI Test Tool
  if (generateAiTestBlockBtn) {
    generateAiTestBlockBtn.addEventListener('click', () => {
      const sampleBlock = generateAiDiagnosticPrompt();
      aiTestPromptText.value = sampleBlock;
      aiTestBlockContainer.classList.remove('hidden');
    });
  }

  if (copyAiTestPromptBtn) {
    copyAiTestPromptBtn.addEventListener('click', () => {
      copyToClipboard(aiTestPromptText.value, copyAiTestPromptBtn);
    });
  }

  // Modal actions
  if (closeMappingModalBtn) {
    closeMappingModalBtn.addEventListener('click', hideMappingModal);
  }
  if (cancelMappingBtn) {
    cancelMappingBtn.addEventListener('click', hideMappingModal);
  }
  if (confirmMappingBtn) {
    confirmMappingBtn.addEventListener('click', confirmAndSaveMapping);
  }
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

  const preview = sanitize(text, {
    vault: new Vault(),
    sensitivity: settings.sensitivity,
    enableNames: settings.enableNames,
    allowlist: settings.allowlist,
    customRules: settings.customRules,
    enabledCategories: settings.enabledCategories,
    placeholderStyles: settings.placeholderStyles,
    excludedEntityIds: Array.from(excludedEntityIds)
  });

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

    badge.addEventListener('click', (e) => {
      if (e.target.classList.contains('badge-toggle-btn')) {
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

  sanitizeBtn.disabled = true;
  const originalBtnHtml = sanitizeBtn.innerHTML;
  sanitizeBtn.innerHTML = `
    <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
    </svg>
    <span>Sanitizing...</span>
  `;

  await new Promise(resolve => setTimeout(resolve, 20));

  try {
    await vault.loadFromStorage();
    const result = sanitize(text, {
      vault,
      sensitivity: settings.sensitivity,
      enableNames: settings.enableNames,
      allowlist: settings.allowlist,
      customRules: settings.customRules,
      enabledCategories: settings.enabledCategories,
      placeholderStyles: settings.placeholderStyles,
      excludedEntityIds: Array.from(excludedEntityIds)
    });

    lastSanitizedResult = result;
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

  // Highlight active session aliases
  if (vault.aliases) {
    for (const [aliasToken] of vault.aliases) {
      let idx = 0;
      while ((idx = text.indexOf(aliasToken, idx)) !== -1) {
        spans.push({
          start: idx,
          end: idx + aliasToken.length,
          hlClass: 'hl-placeholder'
        });
        idx += aliasToken.length;
        if (spans.length >= maxSpans) break;
      }
      if (spans.length >= maxSpans) break;
    }
  }

  // Highlight unrecognized redaction tags in red
  const unrecTagRegex = /\[[A-Za-z0-9_ -]*(?:REDACTED|MASKED|MOCK|ANONYMIZED|PII|AADHAAR|AADHAR|PAN|SSN|EMAIL|PHONE|CARD|SECRET|KEY|CONFIDENTIAL)[A-Za-z0-9_ -]*\]|<[A-Za-z0-9_ -]*(?:REDACTED|MASKED|MOCK|ANONYMIZED|PII)[A-Za-z0-9_ -]*>|\{\{[A-Za-z0-9_ -]+\}\}|(?<!\w)REDACTED_[A-Za-z0-9_]+_MOCK(?!\w)|(?<!\d)X{4}[\s-]X{4}[\s-](?:\d{4}|X{4})(?!\d)/gi;
  let utm;
  while ((utm = unrecTagRegex.exec(text)) !== null) {
    const start = utm.index;
    const end = start + utm[0].length;
    if (!spans.some(s => (start >= s.start && start < s.end) || (end > s.start && end <= s.end))) {
      spans.push({
        start,
        end,
        hlClass: 'hl-unrecognized'
      });
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

    // Highlight restored values in output backdrop
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

    // 1. Render Health Check Strip
    if (healthCheckStrip) {
      healthCheckStrip.classList.remove('hidden');
      const hc = res.healthCheck;
      healthCheckStrip.className = `health-strip ${hc.status === 'green' ? 'status-green' : 'status-amber'}`;

      healthIssued.textContent = `Issued ${hc.issuedCount}`;
      healthFound.textContent = `Found ${hc.foundCount}`;
      healthRestored.textContent = `Restored ${hc.restoredCount}`;
      healthMissing.textContent = `Missing ${hc.missingCount}`;
      healthUnrecognized.textContent = `Unrecognized ${hc.unrecognizedCount}`;

      healthDetailsContainer.innerHTML = '';

      // Missing placeholders in amber
      if (hc.missing && hc.missing.length > 0) {
        hc.missing.forEach(mis => {
          const mEl = document.createElement('div');
          mEl.className = 'stat-amber';
          mEl.textContent = `• ${mis.placeholder} not found in reply (the AI may have dropped or rewritten it)`;
          healthDetailsContainer.appendChild(mEl);
        });
      }

      // Correlation hints: Did AI rewrite X as Y?
      if (hc.correlationHints && hc.correlationHints.length > 0) {
        hc.correlationHints.forEach(hint => {
          const hintBox = document.createElement('div');
          hintBox.className = 'correlation-hint-box';

          const hintText = document.createElement('span');
          hintText.textContent = hint.message;

          const mapBtn = document.createElement('button');
          mapBtn.className = 'btn-map-hint';
          mapBtn.textContent = 'Map it';
          mapBtn.addEventListener('click', () => {
            openMappingModal(hint.unrecognizedToken);
          });

          hintBox.appendChild(hintText);
          hintBox.appendChild(mapBtn);
          healthDetailsContainer.appendChild(hintBox);
        });
      }
    }

    // 2. Render Unrecognized Redaction Tokens Section
    if (unrecognizedTokensSection && unrecognizedTokensList) {
      const unrec = res.healthCheck.unrecognized || [];
      if (unrec.length > 0) {
        unrecognizedTokensSection.classList.remove('hidden');
        unrecognizedTokensList.innerHTML = '';

        // Show instruction header hint in Sanitize tab
        if (instructionHint) {
          instructionHint.classList.remove('hidden');
        }

        unrec.forEach(item => {
          const chip = document.createElement('div');
          chip.className = 'unrecognized-chip';

          const tokenBold = document.createElement('strong');
          tokenBold.textContent = item.token;

          const countSpan = document.createElement('span');
          countSpan.textContent = `x${item.count}`;

          const mapBtn = document.createElement('button');
          mapBtn.className = 'btn-map-token';
          mapBtn.textContent = 'Map to...';
          mapBtn.addEventListener('click', () => {
            openMappingModal(item.token);
          });

          chip.appendChild(tokenBold);
          chip.appendChild(countSpan);
          chip.appendChild(mapBtn);
          unrecognizedTokensList.appendChild(chip);
        });
      } else {
        unrecognizedTokensSection.classList.add('hidden');
      }
    }

    // 3. Status Banner
    reverseStatusBanner.classList.remove('hidden');
    const unmatchedCount = res.unmatchedPlaceholders.length;
    if (unmatchedCount > 0 || res.healthCheck.unrecognizedCount > 0) {
      reverseStatusBanner.className = 'status-banner warning';
      reverseStatusBanner.textContent = `Found ${res.restoredCount} restored value(s), ${res.healthCheck.missingCount} missing, ${res.healthCheck.unrecognizedCount} unrecognized tokens.`;
    } else {
      reverseStatusBanner.className = 'status-banner';
      reverseStatusBanner.textContent = `All clear: ${res.restoredCount} value(s) restored with 0 missing and 0 unrecognized.`;
    }

    // 4. Reverse Placeholder Chips
    reversePlaceholderChips.classList.remove('hidden');
    reversePlaceholderChips.innerHTML = '';
    const maxChips = 40;
    const visibleDetails = res.details.slice(0, maxChips);

    for (const detail of visibleDetails) {
      const chip = document.createElement('div');
      chip.className = 'reverse-chip';

      const strong = document.createElement('strong');
      strong.textContent = detail.placeholder;

      const arrow = document.createElement('span');
      arrow.textContent = '→';

      const valEl = document.createElement('span');
      valEl.className = 'masked-val';
      valEl.title = 'Click to reveal';
      valEl.textContent = '••••••••';
      let revealed = false;
      valEl.addEventListener('click', () => {
        revealed = !revealed;
        valEl.textContent = revealed ? detail.realValue : '••••••••';
        valEl.classList.toggle('revealed', revealed);
      });

      chip.appendChild(strong);
      chip.appendChild(arrow);
      chip.appendChild(valEl);
      reversePlaceholderChips.appendChild(chip);
    }
  } finally {
    reverseMapBtn.disabled = false;
    reverseMapBtn.innerHTML = originalBtnHtml;
  }
}

// Open Assisted Manual Mapping Modal
function openMappingModal(token) {
  currentMappingToken = token;
  currentMappingCandidatePl = null;

  popoverTokenLabel.textContent = token;
  const inferredCat = inferCategoryFromToken(token);
  popoverCategoryLabel.textContent = inferredCat;

  const entries = vault.getAllEntries();
  popoverCandidatesList.innerHTML = '';

  if (entries.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.className = 'empty-cell';
    emptyP.textContent = 'No placeholders currently stored in the vault.';
    popoverCandidatesList.appendChild(emptyP);
    confirmMappingBtn.disabled = true;
    mappingPopoverModal.classList.remove('hidden');
    return;
  }

  // Sort: matching inferred category first, then others
  const sorted = [...entries].sort((a, b) => {
    const aMatch = (a.type === inferredCat || a.category === inferredCat);
    const bMatch = (b.type === inferredCat || b.category === inferredCat);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return a.placeholder.localeCompare(b.placeholder);
  });

  const matchingEntries = sorted.filter(e => e.type === inferredCat || e.category === inferredCat);
  const autoSelect = (matchingEntries.length === 1);

  sorted.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'candidate-row';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'mappingCandidate';
    radio.value = entry.placeholder;

    const details = document.createElement('div');
    details.className = 'candidate-details';

    const plSpan = document.createElement('span');
    plSpan.className = 'candidate-pl';
    plSpan.textContent = `${entry.placeholder} (${entry.type})`;

    const maskedSpan = document.createElement('span');
    maskedSpan.className = 'candidate-val';
    const maskedText = maskRealValue(entry.realValue, entry.type);
    maskedSpan.textContent = `Real: ${maskedText} (click to reveal)`;
    let revealed = false;
    maskedSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      revealed = !revealed;
      maskedSpan.textContent = revealed ? `Real: ${entry.realValue}` : `Real: ${maskedText} (click to reveal)`;
      maskedSpan.classList.toggle('revealed', revealed);
    });

    details.appendChild(plSpan);
    details.appendChild(maskedSpan);

    row.appendChild(radio);
    row.appendChild(details);

    const selectThis = () => {
      document.querySelectorAll('.candidate-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      radio.checked = true;
      currentMappingCandidatePl = entry.placeholder;
      confirmMappingBtn.disabled = false;
      confirmMappingBtn.textContent = `Restore occurrences as ${maskedText}`;
    };

    row.addEventListener('click', selectThis);
    radio.addEventListener('change', selectThis);

    if (autoSelect && entry.placeholder === matchingEntries[0].placeholder) {
      selectThis();
    }

    popoverCandidatesList.appendChild(row);
  });

  if (!autoSelect) {
    confirmMappingBtn.disabled = true;
    confirmMappingBtn.textContent = 'Select a mapping above';
  }

  mappingPopoverModal.classList.remove('hidden');
}

function hideMappingModal() {
  mappingPopoverModal.classList.add('hidden');
  currentMappingToken = null;
  currentMappingCandidatePl = null;
}

async function confirmAndSaveMapping() {
  if (!currentMappingToken || !currentMappingCandidatePl) return;

  vault.addAlias(currentMappingToken, currentMappingCandidatePl);
  await vault.saveToStorage();

  hideMappingModal();
  updateVaultUI();
  showToast(`Mapped ${currentMappingToken} to ${currentMappingCandidatePl}`);

  // Re-run Reverse Map immediately
  await executeReverseMap();
}

// Generate Diagnostic Test Prompt (Section 3.F)
function generateAiDiagnosticPrompt() {
  const entries = vault.getAllEntries();
  const tokens = [];

  if (entries.length > 0) {
    const seenTypes = new Set();
    for (const e of entries) {
      if (!seenTypes.has(e.type)) {
        seenTypes.add(e.type);
        tokens.push(`${e.type.toLowerCase()} = ${e.placeholder}`);
      }
    }
  } else {
    // Default sample set
    tokens.push('password = REDACTED_KEY_1');
    tokens.push('ip = 10.0.0.1');
    tokens.push('pan = AAAAA1000A');
    tokens.push('aadhar = REDACTED_AADHAAR_1');
    tokens.push('card = REDACTED_CARD_1');
    tokens.push('email = user_A@example.com');
  }

  return [
    'Note: The following text contains intentional anonymization placeholders.',
    'Repeat the following text exactly, then write a 3-line application log using every token.',
    '',
    ...tokens
  ].join('\n');
}

// Update Vault & Aliases UI
function updateVaultUI() {
  const entries = vault.getAllEntries();
  vaultBadge.textContent = entries.length.toString();

  // 1. Vault Table
  if (entries.length === 0) {
    vaultTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">Vault is currently empty. Sanitize text to populate.</td>
      </tr>
    `;
  } else {
    vaultTableBody.innerHTML = '';
    entries.forEach(entry => {
      const tr = document.createElement('tr');

      const tdPlaceholder = document.createElement('td');
      tdPlaceholder.textContent = entry.placeholder;

      const tdReal = document.createElement('td');
      tdReal.className = 'masked-val';
      const masked = maskRealValue(entry.realValue, entry.type);
      tdReal.textContent = masked;
      tdReal.title = 'Click to reveal real value';
      let revealed = false;
      tdReal.addEventListener('click', () => {
        revealed = !revealed;
        tdReal.textContent = revealed ? entry.realValue : masked;
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

  // 2. Aliases Table
  if (aliasesTableBody) {
    const aliases = vault.getAliases();
    if (aliases.length === 0) {
      aliasesTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="empty-cell">No active session aliases.</td>
        </tr>
      `;
    } else {
      aliasesTableBody.innerHTML = '';
      aliases.forEach(([aliasToken, targetPl]) => {
        const tr = document.createElement('tr');

        const tdAlias = document.createElement('td');
        tdAlias.className = 'hl-token';
        tdAlias.textContent = aliasToken;

        const tdTarget = document.createElement('td');
        tdTarget.textContent = targetPl;

        const tdAction = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-del-row';
        delBtn.title = 'Delete this alias';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', async () => {
          vault.deleteAlias(aliasToken);
          await vault.saveToStorage();
          updateVaultUI();
          showToast(`Deleted alias for ${aliasToken}`);
        });
        tdAction.appendChild(delBtn);

        tr.appendChild(tdAlias);
        tr.appendChild(tdTarget);
        tr.appendChild(tdAction);

        aliasesTableBody.appendChild(tr);
      });
    }
  }
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
