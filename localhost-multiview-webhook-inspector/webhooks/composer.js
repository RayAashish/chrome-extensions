/**
 * Localhost Webhook Inspector & Composer Controller
 * Manages request composition, Web Crypto signature generation, execution,
 * response inspection, diffing, and history management.
 */

import { isLocalDevHost, formatBytes, formatDuration, substituteTemplateVariables, escapeHtml } from '../shared/utils.js';
import { WEBHOOK_TEMPLATES, getTemplateById } from './templates.js';
import {
  generateStripeSignature,
  generateGitHubSignature,
  generateShopifySignature,
  generateGenericSignature
} from './signatures.js';
import {
  getWebhookHistory,
  saveWebhookHistoryEntry,
  deleteHistoryEntry,
  clearAllWebhookHistory,
  exportHistoryAsJson,
  importHistoryFromJson,
  getStoredSecret,
  storeSecret
} from './history.js';

// DOM Element references
const selectTemplate = document.getElementById('select-template');
const templateDesc = document.getElementById('template-description');
const reqMethod = document.getElementById('req-method');
const reqUrl = document.getElementById('req-url');
const urlValidationBadge = document.getElementById('url-validation-badge');
const hostWarning = document.getElementById('host-warning');
const btnSendRequest = document.getElementById('btn-send-request');
const sendSpinner = document.getElementById('send-spinner');
const reqBody = document.getElementById('req-body');
const bodyFeedback = document.getElementById('body-feedback');
const btnFormatJson = document.getElementById('btn-format-json');
const btnValidateJson = document.getElementById('btn-validate-json');
const btnSubstituteVars = document.getElementById('btn-substitute-vars');
const headersTableBody = document.getElementById('headers-table-body');
const btnAddHeader = document.getElementById('btn-add-header');
const headersCountBadge = document.getElementById('headers-count-badge');
const sigScheme = document.getElementById('sig-scheme');
const sigDetailsWrapper = document.getElementById('sig-details-wrapper');
const groupGenericHeader = document.getElementById('group-generic-header');
const sigHeaderName = document.getElementById('sig-header-name');
const sigSecret = document.getElementById('sig-secret');
const btnToggleSecret = document.getElementById('btn-toggle-secret');
const sigPreviewValue = document.getElementById('sig-preview-value');
const resStatusBadge = document.getElementById('res-status-badge');
const resTiming = document.getElementById('res-timing');
const resSize = document.getElementById('res-size');
const resBodyContent = document.getElementById('res-body-content');
const resHeadersContent = document.getElementById('res-headers-content');
const resDiffContent = document.getElementById('res-diff-content');
const btnCopyResponse = document.getElementById('btn-copy-response');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const historySearchInput = document.getElementById('history-search-input');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnExportHistory = document.getElementById('btn-export-history');
const btnImportHistory = document.getElementById('btn-import-history');
const fileImportInput = document.getElementById('file-import-input');
const companionIndicator = document.getElementById('companion-indicator');
const btnOpenCompanion = document.getElementById('btn-open-companion');

// State
let currentHeaders = [{ key: 'Content-Type', value: 'application/json' }];
let previousResponseBody = null;
let lastSelectedTemplateId = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initTemplates();
  initTabSwitchers();
  initHeaders();
  initSignatures();
  initVariablesPreview();
  await loadHistory();
  checkCompanionStatus();

  // Load last stored secret if present
  const storedStripe = await getStoredSecret('stripe');
  if (storedStripe) {
    sigSecret.value = storedStripe;
  }

  // Check URL validation
  validateUrlInput();
});

// Setup Templates Dropdown
function initTemplates() {
  WEBHOOK_TEMPLATES.forEach(tpl => {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = `${tpl.provider}: ${tpl.name}`;
    selectTemplate.appendChild(opt);
  });

  selectTemplate.addEventListener('change', () => {
    const tpl = getTemplateById(selectTemplate.value);
    if (!tpl) return;

    lastSelectedTemplateId = tpl.id;
    templateDesc.textContent = tpl.description;
    reqMethod.value = tpl.method;

    // Preserve port if user already entered a port
    try {
      const currentUrl = new URL(reqUrl.value);
      const port = currentUrl.port || '8080';
      const host = currentUrl.hostname || 'localhost';
      reqUrl.value = `http://${host}:${port}${tpl.defaultPath}`;
    } catch {
      reqUrl.value = `http://localhost:8080${tpl.defaultPath}`;
    }

    validateUrlInput();
    reqBody.value = tpl.body;

    // Set headers
    currentHeaders = Object.entries(tpl.defaultHeaders).map(([key, value]) => ({ key, value }));
    renderHeaders();

    // Set signature scheme
    sigScheme.value = tpl.signatureScheme || 'none';
    updateSignatureUI();
    updateSignaturePreview();
  });
}

// Tab Switchers
function initTabSwitchers() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');

      if (targetId === 'tab-signatures') {
        updateSignaturePreview();
      }
    });
  });

  document.querySelectorAll('.tab-btn-res').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn-res').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.res-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-res-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// URL Validation
reqUrl.addEventListener('input', validateUrlInput);

function validateUrlInput() {
  const urlStr = reqUrl.value.trim();
  const isLocal = isLocalDevHost(urlStr);

  if (isLocal) {
    urlValidationBadge.textContent = 'Localhost';
    urlValidationBadge.className = 'url-badge badge-valid';
    hostWarning.style.display = 'none';
  } else {
    urlValidationBadge.textContent = 'External Host';
    urlValidationBadge.className = 'url-badge badge-invalid';
    hostWarning.style.display = 'block';
  }
}

// Headers Table Management
function initHeaders() {
  btnAddHeader.addEventListener('click', () => {
    currentHeaders.push({ key: '', value: '' });
    renderHeaders();
  });
  renderHeaders();
}

function renderHeaders() {
  headersTableBody.innerHTML = '';
  headersCountBadge.textContent = String(currentHeaders.length);

  currentHeaders.forEach((header, index) => {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    const inputKey = document.createElement('input');
    inputKey.type = 'text';
    inputKey.className = 'form-control form-control-sm';
    inputKey.placeholder = 'Header Name';
    inputKey.value = header.key;
    inputKey.addEventListener('input', e => {
      currentHeaders[index].key = e.target.value;
      updateSignaturePreview();
    });
    tdKey.appendChild(inputKey);

    const tdVal = document.createElement('td');
    const inputVal = document.createElement('input');
    inputVal.type = 'text';
    inputVal.className = 'form-control form-control-sm';
    inputVal.placeholder = 'Header Value';
    inputVal.value = header.value;
    inputVal.addEventListener('input', e => {
      currentHeaders[index].value = e.target.value;
    });
    tdVal.appendChild(inputVal);

    const tdAction = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-outline btn-xs';
    btnDel.textContent = '✕';
    btnDel.title = 'Remove Header';
    btnDel.addEventListener('click', () => {
      currentHeaders.splice(index, 1);
      renderHeaders();
      updateSignaturePreview();
    });
    tdAction.appendChild(btnDel);

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tr.appendChild(tdAction);
    headersTableBody.appendChild(tr);
  });
}

// Signatures UI & Preview
function initSignatures() {
  sigScheme.addEventListener('change', () => {
    updateSignatureUI();
    updateSignaturePreview();
  });

  sigSecret.addEventListener('input', () => {
    const scheme = sigScheme.value;
    if (scheme !== 'none') {
      storeSecret(scheme, sigSecret.value);
    }
    updateSignaturePreview();
  });

  sigHeaderName.addEventListener('input', updateSignaturePreview);

  btnToggleSecret.addEventListener('click', () => {
    if (sigSecret.type === 'password') {
      sigSecret.type = 'text';
      btnToggleSecret.textContent = 'Hide';
    } else {
      sigSecret.type = 'password';
      btnToggleSecret.textContent = 'Show';
    }
  });

  reqBody.addEventListener('input', () => {
    if (sigScheme.value !== 'none') {
      updateSignaturePreview();
    }
  });
}

function updateSignatureUI() {
  const scheme = sigScheme.value;
  if (scheme === 'none') {
    sigDetailsWrapper.style.display = 'none';
  } else {
    sigDetailsWrapper.style.display = 'block';
    groupGenericHeader.style.display = scheme === 'generic' ? 'block' : 'none';
  }
}

async function computeActiveSignature(bodyText) {
  const scheme = sigScheme.value;
  const secret = sigSecret.value;

  if (scheme === 'none' || !secret) {
    return null;
  }

  const payload = substituteTemplateVariables(bodyText || '');

  switch (scheme) {
    case 'stripe':
      return await generateStripeSignature(payload, secret);
    case 'github':
      return await generateGitHubSignature(payload, secret);
    case 'shopify':
      return await generateShopifySignature(payload, secret);
    case 'generic':
      return await generateGenericSignature(payload, secret, sigHeaderName.value);
    default:
      return null;
  }
}

async function updateSignaturePreview() {
  const scheme = sigScheme.value;
  if (scheme === 'none') {
    sigPreviewValue.textContent = 'None';
    return;
  }

  try {
    const sig = await computeActiveSignature(reqBody.value);
    if (sig) {
      sigPreviewValue.textContent = `${sig.headerName}: ${sig.headerValue}`;
    } else {
      sigPreviewValue.textContent = 'Enter secret to preview signature';
    }
  } catch (err) {
    sigPreviewValue.textContent = 'Error computing signature: ' + err.message;
  }
}

// Body Actions: Format, Validate, Substitute
btnFormatJson.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(reqBody.value);
    reqBody.value = JSON.stringify(parsed, null, 2);
    setBodyFeedback('JSON formatted successfully', 'success');
    updateSignaturePreview();
  } catch (err) {
    setBodyFeedback('Invalid JSON: ' + err.message, 'error');
  }
});

btnValidateJson.addEventListener('click', () => {
  try {
    JSON.parse(reqBody.value);
    setBodyFeedback('Valid JSON syntax ✓', 'success');
  } catch (err) {
    setBodyFeedback('Invalid JSON: ' + err.message, 'error');
  }
});

btnSubstituteVars.addEventListener('click', () => {
  reqBody.value = substituteTemplateVariables(reqBody.value);
  setBodyFeedback('Variables evaluated and replaced in place', 'success');
  updateSignaturePreview();
});

function setBodyFeedback(msg, type = '') {
  bodyFeedback.textContent = msg;
  bodyFeedback.className = `feedback-msg ${type}`;
  setTimeout(() => {
    if (bodyFeedback.textContent === msg) {
      bodyFeedback.textContent = '';
      bodyFeedback.className = 'feedback-msg';
    }
  }, 4000);
}

// Variables Table Sample Updates
function initVariablesPreview() {
  const now = new Date();
  const elTimestamp = document.getElementById('var-sample-timestamp');
  const elIso = document.getElementById('var-sample-iso');
  if (elTimestamp) elTimestamp.textContent = String(Math.floor(now.getTime() / 1000));
  if (elIso) elIso.textContent = now.toISOString();
}

// Send Webhook Request
btnSendRequest.addEventListener('click', executeSendRequest);

async function executeSendRequest() {
  const url = reqUrl.value.trim();
  const method = reqMethod.value;
  let body = reqBody.value;

  if (!url) {
    alert('Please enter a target webhook URL.');
    return;
  }

  // Substitute dynamic variables in body and URL
  body = substituteTemplateVariables(body);
  const evaluatedUrl = substituteTemplateVariables(url);

  // Build headers dictionary
  const headersToSend = {};
  currentHeaders.forEach(h => {
    if (h.key.trim()) {
      headersToSend[h.key.trim()] = substituteTemplateVariables(h.value);
    }
  });

  // Calculate & attach signature if configured
  let signatureInfo = null;
  if (sigScheme.value !== 'none') {
    try {
      signatureInfo = await computeActiveSignature(body);
      if (signatureInfo) {
        headersToSend[signatureInfo.headerName] = signatureInfo.headerValue;
      }
    } catch (sigErr) {
      console.warn('Failed to compute signature:', sigErr);
    }
  }

  // Update UI to sending state
  btnSendRequest.disabled = true;
  sendSpinner.style.display = 'inline-block';
  resStatusBadge.textContent = 'Sending...';
  resStatusBadge.className = 'status-badge badge-idle';
  resBodyContent.textContent = 'Waiting for response from ' + evaluatedUrl + '...';

  const startTime = performance.now();
  let status = 0;
  let statusText = '';
  let durationMs = 0;
  let responseText = '';
  let responseHeadersObj = {};
  let errorMsg = null;

  try {
    const fetchOptions = {
      method,
      headers: headersToSend
    };

    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }

    const response = await fetch(evaluatedUrl, fetchOptions);
    durationMs = performance.now() - startTime;
    status = response.status;
    statusText = response.statusText;

    response.headers.forEach((val, key) => {
      responseHeadersObj[key] = val;
    });

    responseText = await response.text();
  } catch (err) {
    durationMs = performance.now() - startTime;
    status = 0;
    statusText = 'Network Error / Refused';
    errorMsg = err.message;
    responseText = `Error connecting to ${evaluatedUrl}:\n${err.message}\n\nTroubleshooting tips:\n1. Ensure your local server is running on the specified port.\n2. Verify the path is correct.\n3. Check if your dev server requires specific CORS headers or is listening on 127.0.0.1 instead of 0.0.0.0.`;
  } finally {
    btnSendRequest.disabled = false;
    sendSpinner.style.display = 'none';
  }

  // Render Response Inspector
  renderResponseResults({
    status,
    statusText,
    durationMs,
    body: responseText,
    headers: responseHeadersObj,
    error: errorMsg
  });

  // Save to storage history
  await saveWebhookHistoryEntry({
    url: evaluatedUrl,
    method,
    headers: headersToSend,
    requestBody: body,
    status,
    statusText,
    durationMs,
    responseHeaders: responseHeadersObj,
    responseBody: responseText,
    signatureHeader: signatureInfo ? `${signatureInfo.headerName}: ${signatureInfo.headerValue}` : null,
    error: errorMsg,
    tag: lastSelectedTemplateId || 'custom'
  });

  await loadHistory();
}

function renderResponseResults({ status, statusText, durationMs, body, headers, error }) {
  // Status Badge
  if (status >= 200 && status < 300) {
    resStatusBadge.className = 'status-badge badge-2xx';
    resStatusBadge.textContent = `${status} ${statusText || 'OK'}`;
  } else if (status >= 400 && status < 500) {
    resStatusBadge.className = 'status-badge badge-4xx';
    resStatusBadge.textContent = `${status} ${statusText || 'Client Error'}`;
  } else if (status >= 500) {
    resStatusBadge.className = 'status-badge badge-5xx';
    resStatusBadge.textContent = `${status} ${statusText || 'Server Error'}`;
  } else {
    resStatusBadge.className = 'status-badge badge-5xx';
    resStatusBadge.textContent = status ? `${status} ${statusText}` : 'Connection Refused';
  }

  // Metrics
  resTiming.textContent = formatDuration(durationMs);
  resSize.textContent = formatBytes(new Blob([body || '']).size);

  // Pretty print response body if JSON
  let formattedBody = body;
  try {
    const parsed = JSON.parse(body);
    formattedBody = JSON.stringify(parsed, null, 2);
  } catch {
    // Keep as raw text
  }
  resBodyContent.textContent = formattedBody;

  // Response Headers
  const headerLines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  resHeadersContent.textContent = headerLines || (error ? 'No headers received.' : 'No custom response headers.');

  // Diff vs previous response
  renderResponseDiff(formattedBody);
  previousResponseBody = formattedBody;
}

function renderResponseDiff(currentBody) {
  if (!previousResponseBody) {
    resDiffContent.innerHTML = '<div class="text-muted text-sm">Send a second request to compare payload differences.</div>';
    return;
  }

  const prevLines = previousResponseBody.split('\n');
  const currLines = currentBody.split('\n');
  const diffHtml = [];

  const maxLines = Math.max(prevLines.length, currLines.length);
  for (let i = 0; i < maxLines; i++) {
    const prev = prevLines[i];
    const curr = currLines[i];

    if (prev === curr) {
      diffHtml.push(`<div class="diff-line unchanged">  ${escapeHtml(curr || '')}</div>`);
    } else {
      if (prev !== undefined) {
        diffHtml.push(`<div class="diff-line removed">- ${escapeHtml(prev)}</div>`);
      }
      if (curr !== undefined) {
        diffHtml.push(`<div class="diff-line added">+ ${escapeHtml(curr)}</div>`);
      }
    }
  }

  resDiffContent.innerHTML = diffHtml.join('');
}

// Copy Response Body
btnCopyResponse.addEventListener('click', () => {
  if (resBodyContent.textContent) {
    navigator.clipboard.writeText(resBodyContent.textContent);
    btnCopyResponse.textContent = 'Copied!';
    setTimeout(() => { btnCopyResponse.textContent = 'Copy Body'; }, 1500);
  }
});

// Load & Render History
async function loadHistory(filterQuery = '') {
  const history = await getWebhookHistory(100);
  historyCount.textContent = String(history.length);

  const query = (filterQuery || historySearchInput.value).toLowerCase().trim();
  const filtered = query
    ? history.filter(h =>
        h.url.toLowerCase().includes(query) ||
        h.method.toLowerCase().includes(query) ||
        String(h.status).includes(query) ||
        (h.tag && h.tag.toLowerCase().includes(query))
      )
    : history;

  if (filtered.length === 0) {
    historyList.innerHTML = `<div class="empty-state">${query ? 'No matching requests' : 'No requests sent yet.'}</div>`;
    return;
  }

  historyList.innerHTML = '';
  filtered.forEach(item => {
    const card = document.createElement('div');
    let statusClass = 'status-err';
    if (item.status >= 200 && item.status < 300) statusClass = 'status-2xx';
    else if (item.status >= 400 && item.status < 500) statusClass = 'status-4xx';
    else if (item.status >= 500) statusClass = 'status-5xx';

    card.className = `history-item ${statusClass}`;

    const timeFormatted = new Date(item.timestamp).toLocaleTimeString();
    card.innerHTML = `
      <div class="history-item-top">
        <span class="history-method">${escapeHtml(item.method)}</span>
        <span class="history-status">${item.status ? escapeHtml(String(item.status)) : 'ERR'}</span>
      </div>
      <div class="history-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
      <div class="history-meta">
        <span>${escapeHtml(item.tag || 'custom')}</span>
        <span>${formatDuration(item.durationMs)} • ${timeFormatted}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      loadHistoryItemIntoComposer(item);
    });

    historyList.appendChild(card);
  });
}

function loadHistoryItemIntoComposer(item) {
  reqMethod.value = item.method;
  reqUrl.value = item.url;
  validateUrlInput();

  if (item.requestBody && !item.requestBody.startsWith('[')) {
    reqBody.value = item.requestBody;
  }

  if (item.headers && typeof item.headers === 'object') {
    currentHeaders = Object.entries(item.headers).map(([k, v]) => ({ key: k, value: v }));
    renderHeaders();
  }

  // If item had a recorded response, show it in the response panel
  if (item.responseBody) {
    renderResponseResults({
      status: item.status,
      statusText: item.statusText,
      durationMs: item.durationMs,
      body: item.responseBody,
      headers: item.responseHeaders || {},
      error: item.error
    });
  }
}

// History Actions
historySearchInput.addEventListener('input', e => loadHistory(e.target.value));

btnClearHistory.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all stored webhook history?')) {
    await clearAllWebhookHistory();
    await loadHistory();
  }
});

btnExportHistory.addEventListener('click', async () => {
  const jsonStr = await exportHistoryAsJson();
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lmvi-webhooks-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnImportHistory.addEventListener('click', () => {
  fileImportInput.click();
});

fileImportInput.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async event => {
    try {
      const res = await importHistoryFromJson(event.target.result);
      alert(`Imported ${res.count} requests successfully!`);
      await loadHistory();
    } catch (err) {
      alert(err.message);
    }
  };
  reader.readAsText(file);
});

// Companion Status Check (Optional Node.js companion script on localhost:9999)
async function checkCompanionStatus() {
  try {
    const res = await fetch('http://127.0.0.1:9999/health', { method: 'GET' });
    if (res.ok) {
      companionIndicator.className = 'status-dot dot-online';
      companionIndicator.title = 'Companion listener online on http://127.0.0.1:9999';
    } else {
      companionIndicator.className = 'status-dot dot-idle';
    }
  } catch {
    companionIndicator.className = 'status-dot dot-idle';
    companionIndicator.title = 'Companion listener not running (optional: run companion/receiver.js)';
  }
}

btnOpenCompanion.addEventListener('click', () => {
  alert(
    'Optional Companion Webhook Listener:\n\n' +
    'To receive inbound webhooks locally, run the companion script in your terminal:\n' +
    '  node companion/receiver.js\n\n' +
    'It runs a local HTTP server on http://127.0.0.1:9999 to capture webhooks and inspect them locally.'
  );
});
