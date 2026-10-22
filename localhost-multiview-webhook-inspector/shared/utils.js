/**
 * Shared Utilities: Local Host Validation, Sanitization, and Variable Substitution
 */

const LOCAL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^\[::1\]$/,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /\.localhost$/i
];

/**
 * Checks if a given URL or hostname is strictly a local development host
 */
export function isLocalDevHost(urlOrHost) {
  if (!urlOrHost || typeof urlOrHost !== 'string') return false;

  let hostname = urlOrHost.trim();

  // If a full URL is passed, parse the hostname
  if (hostname.includes('://') || hostname.startsWith('//')) {
    try {
      const parsed = new URL(hostname);
      hostname = parsed.hostname;
    } catch {
      return false;
    }
  } else {
    // Strip port if present (e.g. localhost:3000 -> localhost)
    hostname = hostname.replace(/:\d+$/, '');
  }

  // Remove ipv6 brackets if present
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  return LOCAL_HOST_PATTERNS.some(pattern => pattern.test(cleanHost));
}

/**
 * Safely sanitizes text for safe rendering into DOM (never raw innerHTML)
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats byte counts into human-readable strings
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  if (!bytes || isNaN(bytes)) return '-';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] || 'B'}`;
}

/**
 * Formats duration in milliseconds
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Generates RFC4122 v4 UUID using crypto.randomUUID
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Substitutes dynamic variables in webhook payload templates
 * Supports:
 * - {{timestamp}}: Current Unix epoch in seconds
 * - {{timestamp_ms}}: Current Unix epoch in milliseconds
 * - {{iso_timestamp}}: Current ISO-8601 timestamp string
 * - {{uuid}}: Random v4 UUID
 * - {{random_int}}: Random integer between 1000 and 99999
 * - {{random_email}}: Random generated email address
 */
export function substituteTemplateVariables(text) {
  if (typeof text !== 'string') return text;

  const now = new Date();
  const unixSec = Math.floor(now.getTime() / 1000);
  const unixMs = now.getTime();
  const isoTime = now.toISOString();

  return text
    .replace(/\{\{timestamp\}\}/g, () => String(unixSec))
    .replace(/\{\{timestamp_ms\}\}/g, () => String(unixMs))
    .replace(/\{\{iso_timestamp\}\}/g, () => isoTime)
    .replace(/\{\{uuid\}\}/g, () => generateUUID())
    .replace(/\{\{random_int\}\}/g, () => String(Math.floor(1000 + Math.random() * 90000)))
    .replace(/\{\{random_email\}\}/g, () => `dev_${Math.floor(1000 + Math.random() * 9000)}@example.localhost`);
}

/**
 * RequestAnimationFrame-based throttle helper for 60fps operations (scroll, resize)
 */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;

  return function (...args) {
    lastArgs = args;
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(this, lastArgs);
      });
    }
  };
}

/**
 * Standard debounce helper
 */
export function debounce(fn, wait = 150) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
