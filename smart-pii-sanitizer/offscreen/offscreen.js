/**
 * Smart PII Sanitizer - Offscreen Clipboard Document
 * Dedicated to DOM-based clipboard reading and writing in Manifest V3.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === 'offscreen-clipboard') {
    if (request.action === 'READ') {
      try {
        let text = '';
        const area = document.getElementById('offscreenArea');
        if (area) {
          area.value = '';
          area.focus();
          const ok = document.execCommand('paste');
          if (ok && area.value) {
            text = area.value;
          }
          area.value = '';
        }
        sendResponse({ success: true, text });
      } catch (err) {
        sendResponse({ success: false, error: err.message, text: '' });
      }
      return true;
    }

    if (request.action === 'WRITE') {
      try {
        const area = document.getElementById('offscreenArea');
        if (area) {
          area.value = request.text || '';
          area.focus();
          area.select();
          const ok = document.execCommand('copy');
          area.value = '';
          sendResponse({ success: Boolean(ok) });
        } else {
          sendResponse({ success: false });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  }
});
