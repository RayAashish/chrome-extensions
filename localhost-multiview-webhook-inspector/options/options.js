/**
 * Options Page Controller
 * Manages user preferences for synchronization fidelity and webhook persistence.
 */

const optHoverSync = document.getElementById('opt-hover-sync');
const optLowFidelity = document.getElementById('opt-low-fidelity');
const optPersistBodies = document.getElementById('opt-persist-bodies');
const optTimeout = document.getElementById('opt-timeout');
const btnSave = document.getElementById('btn-save');
const btnClearAll = document.getElementById('btn-clear-all');
const saveStatus = document.getElementById('save-status');

document.addEventListener('DOMContentLoaded', async () => {
  // Load settings
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lmvi_options'], result => {
      const opts = result.lmvi_options || {};
      optHoverSync.checked = opts.hoverSync ?? false;
      optLowFidelity.checked = opts.lowFidelity ?? false;
      optPersistBodies.checked = opts.persistBodies ?? true;
      optTimeout.value = opts.timeout ?? 10000;
    });
  }

  btnSave.addEventListener('click', () => {
    const options = {
      hoverSync: optHoverSync.checked,
      lowFidelity: optLowFidelity.checked,
      persistBodies: optPersistBodies.checked,
      timeout: parseInt(optTimeout.value, 10) || 10000
    };

    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ lmvi_options: options }, () => {
        saveStatus.textContent = 'Settings saved successfully!';
        setTimeout(() => { saveStatus.textContent = ''; }, 2500);
      });
    }
  });

  btnClearAll.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all saved layouts, webhook history, and test secrets?')) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.clear(() => {
          alert('All extension storage cleared.');
          window.location.reload();
        });
      }
    }
  });
});
