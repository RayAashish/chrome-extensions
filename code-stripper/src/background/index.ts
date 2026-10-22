/**
 * Background Service Worker for CodeStripper.
 * Manages side panel behavior, keyboard shortcuts, and dynamic script execution.
 */

// Configure side panel to open immediately when user clicks the extension action icon
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('Could not set side panel behavior:', err);
    });
  }
});

// Handle custom keyboard shortcuts (Alt+Shift+C)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === '_execute_action' || command === 'toggle-sidepanel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch {
        // Fallback to window-level sidepanel if tab-specific open fails
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    }
  }
});

// Listen for messages between side panel and active tab
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id && chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
          if (tab.windowId) {
            chrome.sidePanel.open({ windowId: tab.windowId });
          }
        });
      }
    });
    sendResponse({ success: true });
    return true;
  }
});
