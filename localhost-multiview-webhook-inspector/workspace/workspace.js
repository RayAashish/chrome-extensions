/**
 * Localhost Multi-View Workspace Controller
 * Orchestrates multi-viewport rendering, hub-and-spoke synchronization relay,
 * device preset configurations, responsive diagnostics, and layout scaling.
 */

import { DEVICE_PRESETS, DEFAULT_TRIO, getDeviceById, rotateDevice } from '../shared/devices.js';
import { isLocalDevHost, generateUUID, escapeHtml } from '../shared/utils.js';

// Session Security & Identification
const workspaceSessionId = generateUUID();
const channelToken = generateUUID();

// State
let currentUrl = 'http://localhost:3000';
let zoomMode = 'fit'; // 'fit' or numeric string '1', '0.75', '0.5'
let zoomScale = 1.0;
let globalSyncEnabled = true;
let hoverSyncEnabled = false;
let overflowDetectorActive = false;
let touchTargetCheckActive = false;

// Active Viewports List
// Each item: { id: string, device: object, mode: 'sync' | 'lead' | 'follow' | 'independent', cardEl: HTMLElement, iframeEl: HTMLIFrameElement }
let activeViewports = [];

// DOM References
const viewportsCanvas = document.getElementById('viewports-canvas');
const templateCard = document.getElementById('viewport-card-template');
const universalUrlInput = document.getElementById('universal-url-input');
const btnNavGo = document.getElementById('btn-nav-go');
const btnNavReload = document.getElementById('btn-nav-reload');
const btnNavBack = document.getElementById('btn-nav-back');
const btnNavForward = document.getElementById('btn-nav-forward');
const toggleGlobalSync = document.getElementById('toggle-global-sync');
const syncStatusLabel = document.getElementById('sync-status-label');
const zoomSelect = document.getElementById('zoom-select');
const btnToggleOverflow = document.getElementById('btn-toggle-overflow');
const btnToggleTouch = document.getElementById('btn-toggle-touch');
const btnToggleHoverSync = document.getElementById('btn-toggle-hover-sync');
const btnToggleGrid = document.getElementById('btn-toggle-grid');
const gridOverlay = document.getElementById('grid-overlay');
const btnCaptureScreenshot = document.getElementById('btn-capture-screenshot');
const btnAddViewport = document.getElementById('btn-add-viewport');
const btnResetLayout = document.getElementById('btn-reset-layout');
const originIndicator = document.getElementById('origin-indicator');
const statusText = document.getElementById('status-text');

// Tabs
const tabMultiview = document.getElementById('tab-view-multiview');
const tabWebhooks = document.getElementById('tab-view-webhooks');
const tabSplit = document.getElementById('tab-view-split');
const panelMultiview = document.getElementById('panel-multiview');
const panelWebhooks = document.getElementById('panel-webhooks');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Read initial URL from query parameters if launched from a localhost tab
  const params = new URLSearchParams(window.location.search);
  const targetFromParam = params.get('url');
  if (targetFromParam && isLocalDevHost(targetFromParam)) {
    currentUrl = targetFromParam;
    universalUrlInput.value = currentUrl;
  }

  originIndicator.textContent = currentUrl;

  // Initialize view mode tabs
  initViewModeTabs();

  // Load saved device layout or defaults
  await restoreOrInitializeLayout();

  // Setup toolbar interactions
  initToolbarControls();

  // Listen for window resize to recalibrate zoom when 'fit' is active
  window.addEventListener('resize', () => {
    if (zoomMode === 'fit') {
      applyZoom();
    }
  });

  // Setup Cross-Frame Message Hub
  window.addEventListener('message', handleHubMessage);

  // Notify service worker that workspace is active (for DNR rules)
  notifyServiceWorkerWorkspaceState(true);

  window.addEventListener('beforeunload', () => {
    notifyServiceWorkerWorkspaceState(false);
  });
});

function notifyServiceWorkerWorkspaceState(isActive) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'LMVI_WORKSPACE_STATE_CHANGE',
      sessionId: workspaceSessionId,
      isActive,
      url: currentUrl
    }).catch(() => {
      // Background SW may be temporarily idle
    });
  }
}

// ==========================================
// 1. VIEWPORT INITIALIZATION & RENDERING
// ==========================================

async function restoreOrInitializeLayout() {
  const originKey = getOriginKey(currentUrl);
  let savedPresets = null;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const res = await chrome.storage.local.get([`lmvi_layout_${originKey}`]);
      savedPresets = res[`lmvi_layout_${originKey}`];
    } catch {}
  }

  // Clear existing
  viewportsCanvas.innerHTML = '';
  activeViewports = [];

  const presetIds = (savedPresets && Array.isArray(savedPresets) && savedPresets.length > 0)
    ? savedPresets
    : DEFAULT_TRIO;

  presetIds.forEach((presetId, index) => {
    addViewport(presetId, false);
  });

  applyZoom();
  saveCurrentLayout();
}

function getOriginKey(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.origin.replace(/[^a-z0-9]/gi, '_');
  } catch {
    return 'localhost_3000';
  }
}

function addViewport(presetId = 'iphone-15', shouldRecalculateZoom = true) {
  if (activeViewports.length >= 4) {
    alert('Maximum of 4 viewports can be rendered simultaneously for optimal performance.');
    return;
  }

  const device = getDeviceById(presetId);
  const frameId = `frame_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Clone from template
  const clone = templateCard.content.cloneNode(true);
  const cardEl = clone.querySelector('.viewport-card');
  cardEl.setAttribute('data-frame-id', frameId);

  // References
  const selectPreset = cardEl.querySelector('.device-preset-select');
  const labelDims = cardEl.querySelector('.device-dimensions-label');
  const badgeBreakpoint = cardEl.querySelector('.breakpoint-badge');
  const selectMode = cardEl.querySelector('.frame-mode-select');
  const btnRotate = cardEl.querySelector('.btn-rotate');
  const btnReload = cardEl.querySelector('.btn-reload-frame');
  const btnRemove = cardEl.querySelector('.btn-remove-frame');
  const bannerAlert = cardEl.querySelector('.viewport-alert-banner');
  const alertDismiss = cardEl.querySelector('.alert-dismiss');
  const stripOverflow = cardEl.querySelector('.overflow-culprit-strip');
  const frameScaler = cardEl.querySelector('.frame-scaler-container');
  const frameBezel = cardEl.querySelector('.frame-bezel');
  const iframeEl = cardEl.querySelector('.app-iframe');
  const btnOpenTab = cardEl.querySelector('.btn-open-tab');

  // Populate presets dropdown
  DEVICE_PRESETS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.width}×${p.height})`;
    if (p.id === device.id) opt.selected = true;
    selectPreset.appendChild(opt);
  });

  // Set Dimensions
  updateCardDimensions(cardEl, device);

  // Setup Iframe URL
  iframeEl.src = currentUrl;

  // Preset Change
  selectPreset.addEventListener('change', () => {
    const newDevice = getDeviceById(selectPreset.value);
    const vp = activeViewports.find(v => v.id === frameId);
    if (vp) {
      vp.device = newDevice;
      updateCardDimensions(cardEl, newDevice);
      applyZoom();
      saveCurrentLayout();
    }
  });

  // Rotate
  btnRotate.addEventListener('click', () => {
    const vp = activeViewports.find(v => v.id === frameId);
    if (vp) {
      vp.device = rotateDevice(vp.device);
      updateCardDimensions(cardEl, vp.device);
      applyZoom();
    }
  });

  // Reload
  btnReload.addEventListener('click', () => {
    iframeEl.src = iframeEl.src;
  });

  // Close / Remove
  btnRemove.addEventListener('click', () => {
    if (activeViewports.length <= 1) {
      alert('At least one viewport must remain open.');
      return;
    }
    cardEl.remove();
    activeViewports = activeViewports.filter(v => v.id !== frameId);
    applyZoom();
    saveCurrentLayout();
  });

  // Dismiss Alert
  alertDismiss.addEventListener('click', () => {
    bannerAlert.style.display = 'none';
  });

  // Cert error open tab guidance
  if (btnOpenTab) {
    btnOpenTab.addEventListener('click', () => {
      window.open(currentUrl, '_blank');
    });
  }

  // Frame Mode change
  selectMode.addEventListener('change', () => {
    const vp = activeViewports.find(v => v.id === frameId);
    if (vp) {
      vp.mode = selectMode.value;
      sendToFrame(iframeEl, 'LMVI_SETTINGS_UPDATE', { frameMode: vp.mode });
    }
  });

  viewportsCanvas.appendChild(cardEl);

  const viewportObj = {
    id: frameId,
    device,
    mode: 'sync',
    cardEl,
    iframeEl,
    labelDims,
    badgeBreakpoint,
    bannerAlert,
    stripOverflow,
    frameScaler,
    frameBezel
  };

  activeViewports.push(viewportObj);

  if (shouldRecalculateZoom) {
    applyZoom();
    saveCurrentLayout();
  }
}

function updateCardDimensions(cardEl, device) {
  const labelDims = cardEl.querySelector('.device-dimensions-label');
  const frameScaler = cardEl.querySelector('.frame-scaler-container');
  const frameBezel = cardEl.querySelector('.frame-bezel');
  const iframeEl = cardEl.querySelector('.app-iframe');

  labelDims.textContent = `${device.width} × ${device.height}`;

  // Physical size of iframe in true CSS pixels
  iframeEl.style.width = `${device.width}px`;
  iframeEl.style.height = `${device.height}px`;

  frameBezel.style.width = `${device.width}px`;
  frameBezel.style.height = `${device.height}px`;

  // Reserve scaled layout space on scaler container
  updateScalerContainer(frameScaler, device, zoomScale);
}

function updateScalerContainer(scalerEl, device, scale) {
  scalerEl.style.width = `${Math.round(device.width * scale)}px`;
  scalerEl.style.height = `${Math.round(device.height * scale)}px`;
}

// ==========================================
// 2. ZOOM & SCALING CALCULATION
// ==========================================

function applyZoom() {
  if (zoomMode === 'fit') {
    zoomScale = computeOptimalFitScale();
  } else {
    zoomScale = parseFloat(zoomMode) || 1.0;
  }

  document.documentElement.style.setProperty('--zoom-scale', String(zoomScale));

  // Update layout boxes of all active viewports
  activeViewports.forEach(vp => {
    updateScalerContainer(vp.frameScaler, vp.device, zoomScale);
  });
}

function computeOptimalFitScale() {
  const canvasRect = viewportsCanvas.getBoundingClientRect();
  const availableWidth = Math.max(300, canvasRect.width - 64);
  const availableHeight = Math.max(300, canvasRect.height - 80);

  if (activeViewports.length === 0) return 1.0;

  // Total unscaled width needed with gaps (24px between viewports)
  const totalRawWidth = activeViewports.reduce((sum, vp) => sum + vp.device.width, 0) + (activeViewports.length - 1) * 24;
  const maxRawHeight = Math.max(...activeViewports.map(vp => vp.device.height));

  const scaleX = availableWidth / totalRawWidth;
  const scaleY = availableHeight / maxRawHeight;

  // Use the fit scale, bounded between 0.25 and 1.0
  const fit = Math.min(scaleX, scaleY, 1.0);
  return Math.max(0.25, Math.min(1.0, parseFloat(fit.toFixed(2))));
}

zoomSelect.addEventListener('change', () => {
  zoomMode = zoomSelect.value;
  applyZoom();
});

// ==========================================
// 3. HUB-AND-SPOKE SYNCHRONIZATION ENGINE
// ==========================================

function handleHubMessage(event) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  // Initial Handshake
  if (data.type === 'LMVI_HANDSHAKE_INIT') {
    const senderWindow = event.source;
    const matchingVp = activeViewports.find(vp => vp.iframeEl.contentWindow === senderWindow);

    if (matchingVp) {
      senderWindow.postMessage({
        protocol: '1.0.0',
        type: 'LMVI_HANDSHAKE_ACK',
        channelToken,
        payload: {
          frameId: matchingVp.id,
          channelToken,
          settings: {
            syncEnabled: globalSyncEnabled,
            hoverSync: hoverSyncEnabled,
            frameMode: matchingVp.mode
          }
        }
      }, '*');

      statusText.textContent = `Viewport ${matchingVp.device.name} handshaked`;
    }
    return;
  }

  // Security check: message must include valid channel token
  if (data.channelToken !== channelToken) {
    return;
  }

  const sourceFrame = activeViewports.find(vp => vp.id === data.sourceFrameId);

  // Diagnostics and Breakpoint reports
  if (data.type === 'LMVI_BREAKPOINT_UPDATE') {
    if (sourceFrame) {
      sourceFrame.badgeBreakpoint.textContent = `Tailwind: ${data.payload.tailwind} • Bootstrap: ${data.payload.bootstrap}`;
    }
    return;
  }

  if (data.type === 'LMVI_OVERFLOW_REPORT') {
    if (sourceFrame) {
      if (data.payload.count > 0) {
        sourceFrame.stripOverflow.style.display = 'block';
        const culpritsSummary = data.payload.culprits.map(c => `${c.selector} (+${c.overflowPixels}px)`).join(', ');
        sourceFrame.stripOverflow.querySelector('.overflow-culprit-list').textContent = culpritsSummary;
      } else {
        sourceFrame.stripOverflow.style.display = 'none';
      }
    }
    return;
  }

  if (data.type === 'LMVI_ELEMENT_NOT_FOUND') {
    if (sourceFrame) {
      showMismatchAlert(sourceFrame, data.payload);
    }
    return;
  }

  // Interaction Synchronization Relay
  if (!globalSyncEnabled) return;
  if (sourceFrame && sourceFrame.mode === 'independent') return;

  // Relay event to all other viewports (followers)
  activeViewports.forEach(targetVp => {
    if (targetVp.id === data.sourceFrameId) return; // Do not echo to leader
    if (targetVp.mode === 'independent' || targetVp.mode === 'lead') return;

    try {
      targetVp.iframeEl.contentWindow.postMessage({
        ...data,
        isReplay: true
      }, '*');
    } catch (err) {
      console.warn(`[LMVI Workspace] Failed to relay to frame ${targetVp.id}:`, err);
    }
  });
}

function sendToFrame(iframeEl, type, payload = {}) {
  try {
    iframeEl.contentWindow.postMessage({
      protocol: '1.0.0',
      type,
      channelToken,
      payload
    }, '*');
  } catch {}
}

function broadcastToAllFrames(type, payload = {}) {
  activeViewports.forEach(vp => {
    sendToFrame(vp.iframeEl, type, payload);
  });
}

// Show Element Mismatch Alert on Follower Frame
function showMismatchAlert(vp, payload) {
  const banner = vp.bannerAlert;
  const alertText = banner.querySelector('.alert-text');
  const locatorDesc = payload.targetLocator?.summary || payload.targetLocator?.testId || 'element';
  const reasonText = payload.status === 'hidden' ? 'Hidden in this breakpoint' : 'Not found in DOM';

  alertText.textContent = `⚠️ Element "${locatorDesc}": ${reasonText}`;
  banner.style.display = 'flex';

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    if (banner.style.display === 'flex') {
      banner.style.display = 'none';
    }
  }, 6000);
}

// ==========================================
// 4. NAVIGATION & TOOLBAR CONTROLS
// ==========================================

function initToolbarControls() {
  // Go to URL
  btnNavGo.addEventListener('click', navigateAllFrames);
  universalUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigateAllFrames();
  });

  // Reload All
  btnNavReload.addEventListener('click', reloadAllFrames);

  // Back & Forward
  btnNavBack.addEventListener('click', () => {
    activeViewports.forEach(vp => {
      try { vp.iframeEl.contentWindow.history.back(); } catch {}
    });
  });

  btnNavForward.addEventListener('click', () => {
    activeViewports.forEach(vp => {
      try { vp.iframeEl.contentWindow.history.forward(); } catch {}
    });
  });

  // Global Sync Switch
  toggleGlobalSync.addEventListener('change', () => {
    globalSyncEnabled = toggleGlobalSync.checked;
    syncStatusLabel.textContent = globalSyncEnabled ? 'Sync ON' : 'Sync OFF';
    syncStatusLabel.style.color = globalSyncEnabled ? 'var(--success)' : 'var(--danger)';
    broadcastToAllFrames('LMVI_SETTINGS_UPDATE', { syncEnabled: globalSyncEnabled });
  });

  // Hover Sync Toggle
  btnToggleHoverSync.addEventListener('click', () => {
    hoverSyncEnabled = !hoverSyncEnabled;
    btnToggleHoverSync.classList.toggle('active', hoverSyncEnabled);
    broadcastToAllFrames('LMVI_SETTINGS_UPDATE', { hoverSync: hoverSyncEnabled });
  });

  // Overflow Detector Toggle
  btnToggleOverflow.addEventListener('click', () => {
    overflowDetectorActive = !overflowDetectorActive;
    btnToggleOverflow.classList.toggle('active', overflowDetectorActive);
    broadcastToAllFrames('LMVI_REQUEST_OVERFLOW_CHECK', { highlight: overflowDetectorActive });
  });

  // Touch Target Warning Toggle
  btnToggleTouch.addEventListener('click', () => {
    touchTargetCheckActive = !touchTargetCheckActive;
    btnToggleTouch.classList.toggle('active', touchTargetCheckActive);
    broadcastToAllFrames('LMVI_SETTINGS_UPDATE', { touchTargetCheck: touchTargetCheckActive });
  });

  // Grid Overlay Toggle
  btnToggleGrid.addEventListener('click', () => {
    const isVisible = gridOverlay.style.display === 'block';
    gridOverlay.style.display = isVisible ? 'none' : 'block';
    btnToggleGrid.classList.toggle('active', !isVisible);
  });

  // Add Viewport Button
  btnAddViewport.addEventListener('click', () => {
    addViewport('custom', true);
  });

  // Reset to Default Trio
  btnResetLayout.addEventListener('click', () => {
    viewportsCanvas.innerHTML = '';
    activeViewports = [];
    DEFAULT_TRIO.forEach(pId => addViewport(pId, false));
    applyZoom();
    saveCurrentLayout();
  });

  // Screenshot Button
  btnCaptureScreenshot.addEventListener('click', captureWorkspaceScreenshot);
}

function navigateAllFrames() {
  let url = universalUrlInput.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  currentUrl = url;
  universalUrlInput.value = url;
  originIndicator.textContent = url;

  activeViewports.forEach(vp => {
    vp.iframeEl.src = url;
  });

  saveCurrentLayout();
  notifyServiceWorkerWorkspaceState(true);
}

function reloadAllFrames() {
  activeViewports.forEach(vp => {
    try {
      vp.iframeEl.contentWindow.location.reload();
    } catch {
      vp.iframeEl.src = vp.iframeEl.src;
    }
  });
}

function saveCurrentLayout() {
  const originKey = getOriginKey(currentUrl);
  const presetIds = activeViewports.map(vp => vp.device.id);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [`lmvi_layout_${originKey}`]: presetIds }).catch(() => {});
  }
}

// Screenshot Capture using Chrome Tabs API or fallback notification
async function captureWorkspaceScreenshot() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.captureVisibleTab) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `lmvi-multiview-${Date.now()}.png`;
      a.click();
      statusText.textContent = 'Screenshot saved!';
      setTimeout(() => { statusText.textContent = 'Synchronized workspace ready'; }, 3000);
      return;
    } catch (err) {
      console.warn('Tab capture error:', err);
    }
  }
  alert('Screenshot capture is available when running inside Chrome extension context.');
}

// ==========================================
// 5. VIEW MODE TABS (MULTI-VIEW / WEBHOOKS / SPLIT)
// ==========================================

function initViewModeTabs() {
  tabMultiview.addEventListener('click', () => setViewMode('multiview'));
  tabWebhooks.addEventListener('click', () => setViewMode('webhooks'));
  tabSplit.addEventListener('click', () => setViewMode('split'));
}

function setViewMode(mode) {
  tabMultiview.classList.toggle('active', mode === 'multiview');
  tabWebhooks.classList.toggle('active', mode === 'webhooks');
  tabSplit.classList.toggle('active', mode === 'split');

  document.body.querySelector('.app-layout').classList.toggle('mode-split', mode === 'split');

  if (mode === 'multiview') {
    panelMultiview.classList.add('active');
    panelWebhooks.classList.remove('active');
  } else if (mode === 'webhooks') {
    panelMultiview.classList.remove('active');
    panelWebhooks.classList.add('active');
  } else if (mode === 'split') {
    panelMultiview.classList.add('active');
    panelWebhooks.classList.add('active');
  }

  // Recalibrate zoom after mode transition
  setTimeout(() => applyZoom(), 100);
}
