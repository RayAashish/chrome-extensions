/**
 * Smart PII Sanitizer - Options / Settings Controller
 */

const AI_SITES = [
  { name: 'ChatGPT', origin: 'https://chatgpt.com/*' },
  { name: 'Claude', origin: 'https://*.claude.ai/*' },
  { name: 'Google Gemini', origin: 'https://gemini.google.com/*' },
  { name: 'Microsoft Copilot', origin: 'https://copilot.microsoft.com/*' },
  { name: 'Perplexity AI', origin: 'https://www.perplexity.ai/*' },
  { name: 'DeepSeek Chat', origin: 'https://chat.deepseek.com/*' },
  { name: 'Grok', origin: 'https://grok.com/*' }
];

let customRules = [];

// DOM Elements
const catEmail = document.getElementById('catEmail');
const catNetwork = document.getElementById('catNetwork');
const catSecrets = document.getElementById('catSecrets');
const catFinancial = document.getElementById('catFinancial');
const catIdCards = document.getElementById('catIdCards');
const catContact = document.getElementById('catContact');
const catNames = document.getElementById('catNames');

const styleAadhaar = document.getElementById('styleAadhaar');
const styleSsn = document.getElementById('styleSsn');
const styleCard = document.getElementById('styleCard');
const stylePan = document.getElementById('stylePan');
const styleEmail = document.getElementById('styleEmail');
const styleIp = document.getElementById('styleIp');

const instructionTemplateText = document.getElementById('instructionTemplateText');

const sensitivityRadios = document.querySelectorAll('input[name="sensitivity"]');
const allowlistText = document.getElementById('allowlistText');

const ruleName = document.getElementById('ruleName');
const ruleRegex = document.getElementById('ruleRegex');
const ruleTemplate = document.getElementById('ruleTemplate');
const addRuleBtn = document.getElementById('addRuleBtn');
const rulesTableBody = document.getElementById('rulesTableBody');

const autoExpireSelect = document.getElementById('autoExpireSelect');
const encryptPersistenceToggle = document.getElementById('encryptPersistenceToggle');
const passphraseArea = document.getElementById('passphraseArea');
const vaultPassphrase = document.getElementById('vaultPassphrase');

const sitesList = document.getElementById('sitesList');
const saveTopBtn = document.getElementById('saveTopBtn');
const saveBottomBtn = document.getElementById('saveBottomBtn');
const saveStatus = document.getElementById('saveStatus');

async function init() {
  await loadSavedSettings();
  await renderSitesList();
  attachEvents();
}

async function loadSavedSettings() {
  const res = await chrome.storage.local.get(['smart_pii_settings', 'smart_pii_encrypted_enabled']);
  const s = res.smart_pii_settings || {};

  // Categories
  if (s.enabledCategories) {
    catEmail.checked = s.enabledCategories.EMAIL !== false;
    catNetwork.checked = s.enabledCategories.NETWORK !== false;
    catSecrets.checked = s.enabledCategories.SECRETS !== false;
    catFinancial.checked = s.enabledCategories.FINANCIAL !== false;
    catIdCards.checked = s.enabledCategories.ID_CARDS !== false;
    catContact.checked = s.enabledCategories.CONTACT !== false;
  }
  catNames.checked = Boolean(s.enableNames);

  // Placeholder Styles (Section 3.A)
  const styles = s.placeholderStyles || {};
  if (styleAadhaar) styleAadhaar.value = styles.AADHAAR || 'TAG';
  if (styleSsn) styleSsn.value = styles.SSN || 'TAG';
  if (styleCard) styleCard.value = styles.CREDIT_CARD || 'TAG';
  if (stylePan) stylePan.value = styles.PAN || 'FORMAT_VALID';
  if (styleEmail) styleEmail.value = styles.EMAIL || 'FORMAT_VALID';
  if (styleIp) styleIp.value = styles.IPV4 || 'FORMAT_VALID';

  // LLM Instruction Header Template (Section 3.B)
  if (instructionTemplateText) {
    instructionTemplateText.value = s.instructionTemplate ||
      'Note: tokens like {TOKENS} are intentional anonymization placeholders. Keep them exactly as written in your answer; do not mask, reformat, explain or replace them.';
  }

  // Sensitivity
  const sensitivity = s.sensitivity || 'balanced';
  sensitivityRadios.forEach(r => {
    r.checked = r.value === sensitivity;
  });

  // Allowlist
  if (Array.isArray(s.allowlist)) {
    allowlistText.value = s.allowlist.join('\n');
  }

  // Custom Rules
  customRules = Array.isArray(s.customRules) ? [...s.customRules] : [];
  renderRulesTable();

  // Auto-expire
  if (typeof s.autoExpireMinutes !== 'undefined') {
    autoExpireSelect.value = s.autoExpireMinutes.toString();
  }

  // Encrypted persistence
  encryptPersistenceToggle.checked = Boolean(res.smart_pii_encrypted_enabled);
  passphraseArea.classList.toggle('hidden', !encryptPersistenceToggle.checked);
}

function renderRulesTable() {
  if (customRules.length === 0) {
    rulesTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-rules">No custom rules added yet.</td>
      </tr>
    `;
    return;
  }

  rulesTableBody.innerHTML = '';
  customRules.forEach((rule, idx) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = rule.name;

    const tdRegex = document.createElement('td');
    tdRegex.textContent = rule.regex;

    const tdTpl = document.createElement('td');
    tdTpl.textContent = rule.template;

    const tdAct = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-perm';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      customRules.splice(idx, 1);
      renderRulesTable();
    });
    tdAct.appendChild(delBtn);

    tr.appendChild(tdName);
    tr.appendChild(tdRegex);
    tr.appendChild(tdTpl);
    tr.appendChild(tdAct);

    rulesTableBody.appendChild(tr);
  });
}

async function renderSitesList() {
  sitesList.innerHTML = '';
  const granted = await chrome.permissions.getAll();
  const grantedOrigins = new Set(granted.origins || []);

  for (const site of AI_SITES) {
    const isGranted = grantedOrigins.has(site.origin) || Array.from(grantedOrigins).some(o => site.origin.includes(o.replace('/*', '')));

    const item = document.createElement('div');
    item.className = 'site-item';

    const info = document.createElement('div');
    info.innerHTML = `
      <span class="site-name">${site.name}</span>
      <span class="site-origin">${site.origin}</span>
    `;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';

    const badge = document.createElement('span');
    badge.className = `site-badge ${isGranted ? 'badge-granted' : 'badge-unassigned'}`;
    badge.textContent = isGranted ? 'Protected' : 'Not Granted';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-perm';
    toggleBtn.textContent = isGranted ? 'Revoke' : 'Enable';

    toggleBtn.addEventListener('click', async () => {
      if (isGranted) {
        await chrome.permissions.remove({ origins: [site.origin] });
      } else {
        await chrome.permissions.request({ origins: [site.origin] });
      }
      chrome.runtime.sendMessage({ type: 'SYNC_PERMISSIONS' });
      await renderSitesList();
    });

    controls.appendChild(badge);
    controls.appendChild(toggleBtn);

    item.appendChild(info);
    item.appendChild(controls);

    sitesList.appendChild(item);
  }
}

function attachEvents() {
  addRuleBtn.addEventListener('click', () => {
    const name = ruleName.value.trim();
    const regex = ruleRegex.value.trim();
    const template = ruleTemplate.value.trim() || 'CUSTOM_TOKEN_{N}';

    if (!name || !regex) {
      alert('Please provide both Rule Name and Regex Pattern');
      return;
    }

    try {
      new RegExp(regex);
    } catch (e) {
      alert(`Invalid regular expression: ${e.message}`);
      return;
    }

    customRules.push({
      id: `rule_${Date.now()}`,
      name,
      regex,
      template
    });

    ruleName.value = '';
    ruleRegex.value = '';
    ruleTemplate.value = '';
    renderRulesTable();
  });

  encryptPersistenceToggle.addEventListener('change', () => {
    passphraseArea.classList.toggle('hidden', !encryptPersistenceToggle.checked);
  });

  saveTopBtn.addEventListener('click', saveAll);
  saveBottomBtn.addEventListener('click', saveAll);
}

async function saveAll() {
  let selectedSensitivity = 'balanced';
  sensitivityRadios.forEach(r => {
    if (r.checked) selectedSensitivity = r.value;
  });

  const allowlist = allowlistText.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const placeholderStyles = {
    AADHAAR: styleAadhaar ? styleAadhaar.value : 'TAG',
    SSN: styleSsn ? styleSsn.value : 'TAG',
    CREDIT_CARD: styleCard ? styleCard.value : 'TAG',
    PAN: stylePan ? stylePan.value : 'FORMAT_VALID',
    EMAIL: styleEmail ? styleEmail.value : 'FORMAT_VALID',
    IPV4: styleIp ? styleIp.value : 'FORMAT_VALID'
  };

  const instructionTemplate = instructionTemplateText
    ? instructionTemplateText.value.trim()
    : 'Note: tokens like {TOKENS} are intentional anonymization placeholders. Keep them exactly as written in your answer; do not mask, reformat, explain or replace them.';

  const newSettings = {
    sensitivity: selectedSensitivity,
    enableNames: catNames.checked,
    allowlist,
    customRules,
    placeholderStyles,
    instructionTemplate,
    autoExpireMinutes: parseInt(autoExpireSelect.value, 10) || 0,
    enabledCategories: {
      EMAIL: catEmail.checked,
      NETWORK: catNetwork.checked,
      SECRETS: catSecrets.checked,
      FINANCIAL: catFinancial.checked,
      ID_CARDS: catIdCards.checked,
      CONTACT: catContact.checked,
      NAMES: catNames.checked
    }
  };

  await chrome.storage.local.set({
    smart_pii_settings: newSettings,
    smart_pii_encrypted_enabled: encryptPersistenceToggle.checked
  });

  saveStatus.classList.remove('hidden');
  setTimeout(() => saveStatus.classList.add('hidden'), 2500);
}

document.addEventListener('DOMContentLoaded', init);
