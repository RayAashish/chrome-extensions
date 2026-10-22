/**
 * Background Service Worker (Manifest V3)
 * Manages extension action clicks, keyboard shortcuts, declarativeNetRequest (DNR)
 * session rules for secure localhost iframing, and workspace lifecycle tracking.
 */

import { isLocalDevHost } from '../shared/utils.js';

const DNR_RULE_ID = 1001;

// Active workspace sessions set
const activeWorkspaceSessions = new Set();

/**
 * Configure DeclarativeNetRequest (DNR) session rules
 * Strips X-Frame-Options and Content-Security-Policy ONLY on sub_frame requests
 * initiated by this extension to local development hosts.
 */
async function enableIframeHeaderBypass() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    return;
  }

  const rule = {
    id: DNR_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'X-Frame-Options', operation: 'remove' },
        { header: 'Content-Security-Policy', operation: 'remove' }
      ]
    },
    condition: {
      resourceTypes: ['sub_frame'],
      // Only match local development hosts
      regexFilter: '^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\]|.*\\.localhost)(:[0-9]+)?/'
    }
  };

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [rule]
    });
    console.log('[LMVI SW] DNR session rules activated for localhost sub_frames');
  } catch (err) {
    console.warn('[LMVI SW] Failed to update DNR session rules:', err);
  }
}

async function disableIframeHeaderBypass() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    return;
  }

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_RULE_ID]
    });
    console.log('[LMVI SW] DNR session rules removed');
  } catch (err) {
    console.warn('[LMVI SW] Failed to remove DNR session rules:', err);
  }
}

// Extension Installation & Startup
chrome.runtime.onInstalled.addListener(() => {
  enableIframeHeaderBypass();
});

chrome.runtime.onStartup.addListener(() => {
  enableIframeHeaderBypass();
});

// Update Action icon state and tooltip based on active tab URL
chrome.tabs.onActivated.addListener(async activeInfo => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateActionStateForTab(tab);
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    updateActionStateForTab(tab);
  }
});

function updateActionStateForTab(tab) {
  if (!tab || !tab.url) return;

  const isLocal = isLocalDevHost(tab.url);

  if (isLocal) {
    chrome.action.setTitle({
      tabId: tab.id,
      title: 'Localhost Multi-View & Webhook Inspector: Click to launch workspace'
    });
    chrome.action.setBadgeText({ tabId: tab.id, text: 'DEV' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#10b981' });
  } else {
    chrome.action.setTitle({
      tabId: tab.id,
      title: 'Localhost Multi-View: Disabled on non-local domains (Scoped strictly to localhost / 127.0.0.1)'
    });
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  }
}

// Action Click Handler (Toolbar icon)
chrome.action.onClicked.addListener(async tab => {
  let targetUrl = 'http://localhost:3000';

  if (tab && tab.url && isLocalDevHost(tab.url)) {
    targetUrl = tab.url;
  }

  openWorkspace(targetUrl);
});

// Keyboard Commands Handler
chrome.commands.onCommand.addListener(async command => {
  if (command === 'launch-workspace') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let targetUrl = 'http://localhost:3000';
    if (activeTab && activeTab.url && isLocalDevHost(activeTab.url)) {
      targetUrl = activeTab.url;
    }
    openWorkspace(targetUrl);
  }
});

async function openWorkspace(targetUrl) {
  // Always ensure DNR rules are active before workspace opens
  await enableIframeHeaderBypass();

  const workspaceUrl = chrome.runtime.getURL(`workspace/workspace.html?url=${encodeURIComponent(targetUrl)}`);

  // Check if an existing workspace tab is already open
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find(t => t.url && t.url.startsWith(chrome.runtime.getURL('workspace/workspace.html')));

  if (existingTab && existingTab.id) {
    await chrome.tabs.update(existingTab.id, { active: true, url: workspaceUrl });
    if (existingTab.windowId) {
      chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: workspaceUrl });
  }
}

// Runtime message listener for workspace state tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LMVI_WORKSPACE_STATE_CHANGE') {
    const { sessionId, isActive } = message;

    if (isActive) {
      activeWorkspaceSessions.add(sessionId);
      enableIframeHeaderBypass();
    } else {
      activeWorkspaceSessions.delete(sessionId);
      if (activeWorkspaceSessions.size === 0) {
        // Safe cleanup: remove DNR rules when all workspace tabs are closed
        disableIframeHeaderBypass();
      }
    }
    sendResponse({ success: true });
  }
  return true;
});
