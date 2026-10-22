/**
 * Webhook Request History & Storage Manager
 * Stores webhook requests, responses, and collections in chrome.storage.local
 */

const STORAGE_KEYS = {
  HISTORY: 'lmvi_webhook_history',
  SETTINGS: 'lmvi_webhook_settings',
  SECRETS: 'lmvi_webhook_secrets'
};

const MAX_HISTORY_ITEMS = 200;

export async function getWebhookSettings() {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve({ persistPayloadBodies: true, defaultTimeout: 10000 });
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], result => {
      resolve(result[STORAGE_KEYS.SETTINGS] || { persistPayloadBodies: true, defaultTimeout: 10000 });
    });
  });
}

export async function saveWebhookSettings(settings) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(true);
      return;
    }
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, () => resolve(true));
  });
}

export async function getWebhookHistory(limit = 100) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve([]);
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], result => {
      const history = result[STORAGE_KEYS.HISTORY] || [];
      resolve(history.slice(0, limit));
    });
  });
}

export async function saveWebhookHistoryEntry(entry) {
  const settings = await getWebhookSettings();

  const record = {
    id: entry.id || crypto.randomUUID(),
    timestamp: entry.timestamp || Date.now(),
    method: entry.method || 'POST',
    url: entry.url,
    headers: entry.headers || {},
    status: entry.status,
    statusText: entry.statusText || '',
    durationMs: entry.durationMs || 0,
    responseHeaders: entry.responseHeaders || {},
    tag: entry.tag || 'generic',
    requestBody: settings.persistPayloadBodies ? entry.requestBody : '[Payload body persistence disabled in settings]',
    responseBody: settings.persistPayloadBodies ? entry.responseBody : '[Response body persistence disabled in settings]',
    signatureHeader: entry.signatureHeader || null,
    error: entry.error || null
  };

  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(record);
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], result => {
      let history = result[STORAGE_KEYS.HISTORY] || [];
      history.unshift(record);
      if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
      }
      chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history }, () => {
        resolve(record);
      });
    });
  });
}

export async function deleteHistoryEntry(id) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(true);
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.HISTORY], result => {
      let history = result[STORAGE_KEYS.HISTORY] || [];
      history = history.filter(item => item.id !== id);
      chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history }, () => resolve(true));
    });
  });
}

export async function clearAllWebhookHistory() {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(true);
      return;
    }
    chrome.storage.local.remove([STORAGE_KEYS.HISTORY], () => resolve(true));
  });
}

export async function exportHistoryAsJson() {
  const history = await getWebhookHistory(MAX_HISTORY_ITEMS);
  return JSON.stringify({
    format: 'lmvi_webhook_collection_v1',
    exportedAt: new Date().toISOString(),
    count: history.length,
    requests: history
  }, null, 2);
}

export async function importHistoryFromJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.requests || !Array.isArray(data.requests)) {
      throw new Error('Invalid format: missing "requests" array');
    }
    const current = await getWebhookHistory(MAX_HISTORY_ITEMS);
    const combined = [...data.requests, ...current].slice(0, MAX_HISTORY_ITEMS);

    return new Promise(resolve => {
      chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: combined }, () => {
        resolve({ count: data.requests.length, total: combined.length });
      });
    });
  } catch (err) {
    throw new Error('Failed to import JSON collection: ' + err.message);
  }
}

/**
 * Test secret management in local storage (masked in UI, never leaves machine)
 */
export async function getStoredSecret(schemeName) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve('');
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.SECRETS], result => {
      const secrets = result[STORAGE_KEYS.SECRETS] || {};
      resolve(secrets[schemeName] || '');
    });
  });
}

export async function storeSecret(schemeName, secretValue) {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(true);
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.SECRETS], result => {
      const secrets = result[STORAGE_KEYS.SECRETS] || {};
      secrets[schemeName] = secretValue;
      chrome.storage.local.set({ [STORAGE_KEYS.SECRETS]: secrets }, () => resolve(true));
    });
  });
}
