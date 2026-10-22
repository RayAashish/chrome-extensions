/**
 * Extension Action Popup Controller
 * Detects whether active browser tab is on a local-dev origin,
 * provides quick launch buttons, and opens the workspace or webhook inspector.
 */

import { isLocalDevHost } from '../shared/utils.js';

const statusCard = document.getElementById('status-card');
const statusTitle = document.getElementById('status-title');
const statusUrl = document.getElementById('status-url');
const statusDesc = document.getElementById('status-desc');
const btnLaunchMultiview = document.getElementById('btn-launch-multiview');
const btnOpenWebhooks = document.getElementById('btn-open-webhooks');
const customPortInput = document.getElementById('custom-port-input');
const btnGoCustom = document.getElementById('btn-go-custom');

let detectedUrl = 'http://localhost:3000';
let isLocal = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Check active tab
  if (chrome.tabs && chrome.tabs.query) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      detectedUrl = tab.url;
      isLocal = isLocalDevHost(tab.url);
    }
  }

  statusUrl.textContent = detectedUrl;

  if (isLocal) {
    statusCard.className = 'status-card status-active';
    statusTitle.textContent = 'Localhost Server Detected';
    statusDesc.textContent = 'Ready for multi-viewport layout testing and state synchronization.';
    customPortInput.value = detectedUrl;
  } else {
    statusCard.className = 'status-card status-inactive';
    statusTitle.textContent = 'Not on Localhost';
    statusDesc.textContent = 'This extension is strictly scoped to local dev servers (localhost, 127.0.0.1). Navigate to your local server or enter a local URL below.';
  }

  btnLaunchMultiview.addEventListener('click', () => {
    const target = isLocal ? detectedUrl : customPortInput.value.trim() || 'http://localhost:3000';
    openWorkspace(target, 'multiview');
  });

  btnOpenWebhooks.addEventListener('click', () => {
    const target = isLocal ? detectedUrl : customPortInput.value.trim() || 'http://localhost:3000';
    openWorkspace(target, 'webhooks');
  });

  btnGoCustom.addEventListener('click', () => {
    const target = customPortInput.value.trim() || 'http://localhost:3000';
    openWorkspace(target, 'multiview');
  });
});

function openWorkspace(url, initialTab = 'multiview') {
  const workspaceUrl = chrome.runtime.getURL(`workspace/workspace.html?url=${encodeURIComponent(url)}#${initialTab}`);
  chrome.tabs.create({ url: workspaceUrl });
  window.close();
}
