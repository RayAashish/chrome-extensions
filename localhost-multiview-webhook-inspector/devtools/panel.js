/**
 * DevTools Panel Controller
 * Observes outbound network requests made to local development endpoints,
 * displays them in real-time, and enables one-click replay in the Webhook Composer.
 */

import { isLocalDevHost, formatDuration, escapeHtml } from '../shared/utils.js';
import { saveWebhookHistoryEntry } from '../webhooks/history.js';

const requestsTbody = document.getElementById('requests-tbody');
const emptyState = document.getElementById('empty-state');
const filterInput = document.getElementById('filter-input');
const btnClear = document.getElementById('btn-clear');
const detailsPane = document.getElementById('details-pane');
const generalInfo = document.getElementById('general-info');
const reqHeadersEl = document.getElementById('req-headers');
const reqBodyEl = document.getElementById('req-body');
const resHeadersEl = document.getElementById('res-headers');
const resBodyEl = document.getElementById('res-body');
const btnSendToComposer = document.getElementById('btn-send-to-composer');

let capturedRequests = [];
let selectedRequest = null;

// Listen for network events
if (chrome.devtools && chrome.devtools.network) {
  chrome.devtools.network.onRequestFinished.addListener(request => {
    const url = request.request.url;

    // Filter strictly to local development hosts
    if (!isLocalDevHost(url)) {
      return;
    }

    const item = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      url: request.request.url,
      method: request.request.method,
      status: request.response.status,
      time: request.time,
      requestHeaders: request.request.headers || [],
      postData: request.request.postData?.text || '',
      responseHeaders: request.response.headers || []
    };

    // Asynchronously retrieve response body content
    request.getContent((content, encoding) => {
      item.responseBody = content || '';
      capturedRequests.unshift(item);
      renderTable();
    });
  });
}

function renderTable() {
  const query = filterInput.value.toLowerCase().trim();
  const filtered = query
    ? capturedRequests.filter(r => r.url.toLowerCase().includes(query) || r.method.toLowerCase().includes(query) || String(r.status).includes(query))
    : capturedRequests;

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    requestsTbody.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  requestsTbody.innerHTML = '';

  filtered.forEach(req => {
    const tr = document.createElement('tr');
    if (selectedRequest && selectedRequest.id === req.id) {
      tr.classList.add('selected');
    }

    let statusClass = 'status-2xx';
    if (req.status >= 400 && req.status < 500) statusClass = 'status-4xx';
    else if (req.status >= 500 || req.status === 0) statusClass = 'status-5xx';

    tr.innerHTML = `
      <td><span class="status-badge ${statusClass}">${req.status || 'ERR'}</span></td>
      <td><span class="method-tag">${escapeHtml(req.method)}</span></td>
      <td class="url-cell" title="${escapeHtml(req.url)}">${escapeHtml(req.url)}</td>
      <td>${formatDuration(req.time)}</td>
    `;

    tr.addEventListener('click', () => {
      selectedRequest = req;
      renderTable();
      showDetails(req);
    });

    requestsTbody.appendChild(tr);
  });
}

function showDetails(req) {
  detailsPane.style.display = 'flex';

  generalInfo.innerHTML = `
    <div><strong>Request URL:</strong> ${escapeHtml(req.url)}</div>
    <div><strong>Request Method:</strong> ${escapeHtml(req.method)}</div>
    <div><strong>Status Code:</strong> ${req.status}</div>
    <div><strong>Duration:</strong> ${formatDuration(req.time)}</div>
  `;

  // Request Headers
  reqHeadersEl.textContent = req.requestHeaders.map(h => `${h.name}: ${h.value}`).join('\n') || 'None';

  // Request Payload
  reqBodyEl.textContent = req.postData || 'No payload body';

  // Response Headers
  resHeadersEl.textContent = req.responseHeaders.map(h => `${h.name}: ${h.value}`).join('\n') || 'None';

  // Response Body
  resBodyEl.textContent = req.responseBody || 'No response body recorded';
}

// Clear table
btnClear.addEventListener('click', () => {
  capturedRequests = [];
  selectedRequest = null;
  detailsPane.style.display = 'none';
  renderTable();
});

filterInput.addEventListener('input', renderTable);

// Send to Composer to Replay
btnSendToComposer.addEventListener('click', async () => {
  if (!selectedRequest) return;

  const headersObj = {};
  selectedRequest.requestHeaders.forEach(h => {
    if (!h.name.startsWith(':')) {
      headersObj[h.name] = h.value;
    }
  });

  await saveWebhookHistoryEntry({
    url: selectedRequest.url,
    method: selectedRequest.method,
    headers: headersObj,
    requestBody: selectedRequest.postData,
    status: selectedRequest.status,
    responseBody: selectedRequest.responseBody,
    durationMs: selectedRequest.time,
    tag: 'outbound-captured'
  });

  alert('Request copied to Webhook Composer history! Open the Webhooks view to replay.');
});
