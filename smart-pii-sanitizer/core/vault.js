/**
 * Smart PII Sanitizer - Bidirectional Vault (v2.0 Hardened)
 * Separate namespaces, deterministic formatting, collision-safe.
 */

import {
  indexToLetterSequence,
  generateDeterministicLuhnCard
} from './detectors.js';

const PLACEHOLDER_LITERAL_REGEX = /(?:REDACTED_[A-Z0-9_]+|user_[A-Za-z]+@example\.com|10\.0\.\d{1,3}\.\d{1,3}|2001:db8::[0-9a-fA-F]+|00:00:5E:00:53:[0-9a-fA-F]{2}|(?:urluser|localuser)_\d+|\+1-555-01\d{2}|50000\d{5}|4111-1111-1111-\d{4}|000-12-\d{4}|9999\s?0000\s?\d{4}|[A-Z]{5}[0-9]{4}[A-Z]|host_[A-Za-z0-9_.-]+\.example\.internal|GB00TEST[0-9A-Z]{10})/g;

export class Vault {
  constructor(options = {}) {
    this.realToPlaceholder = new Map();
    this.placeholderToReal = new Map();

    // Counters per namespace
    this.counters = {
      EMAIL: 0,
      URL_USER: 1,    // urluser_1, urluser_2
      LOCAL_USER: 1,  // localuser_1, localuser_2
      IPV4: 1,        // 10.0.0.1, 10.0.0.2
      IPV6: 1,        // 2001:db8::1
      MAC: 1,         // 00:00:5E:00:53:01
      KEY: 1,         // REDACTED_KEY_1
      AWS_KEY: 1,     // REDACTED_AWS_KEY_1
      GITHUB_TOKEN: 1,// REDACTED_GITHUB_TOKEN_1
      STRIPE_KEY: 1,  // REDACTED_STRIPE_KEY_1
      SLACK_TOKEN: 1, // REDACTED_SLACK_TOKEN_1
      GOOGLE_KEY: 1,  // REDACTED_GOOGLE_KEY_1
      JWT: 1,         // REDACTED_JWT_1
      US_PHONE: 100,  // +1-555-0100
      INDIA_PHONE: 1, // 5000000001
      CREDIT_CARD: 0, // 4111-1111-1111-xxxx
      SSN: 1,         // 000-12-0001
      AADHAAR: 1,     // 9999 0000 0001
      PAN: 0,         // AAAAA0000A
      HOST: 0,        // host_A.example.internal
      IBAN: 1,        // GB00TEST0000000001
      CUSTOM: 1
    };

    this.sessionLiteralSet = new Set();
    this.sessionInputText = '';

    this.options = {
      autoExpireMinutes: options.autoExpireMinutes || 0,
      ...options
    };

    this.lastActivity = Date.now();
  }

  registerInputLiterals(text) {
    if (typeof text !== 'string') return;
    if (!this.sessionLiteralSet) {
      this.sessionLiteralSet = new Set();
    }
    const regex = new RegExp(PLACEHOLDER_LITERAL_REGEX.source, 'g');
    let m;
    while ((m = regex.exec(text)) !== null) {
      this.sessionLiteralSet.add(m[0]);
    }
    // Only store raw text for smaller inputs (< 100KB) to prevent quadratic scanning on large files
    if (text.length < 100000) {
      this.sessionInputText = (this.sessionInputText || '') + '\n' + text;
    }
  }

  isExpired() {
    if (!this.options.autoExpireMinutes || this.options.autoExpireMinutes <= 0) {
      return false;
    }
    const maxAgeMs = this.options.autoExpireMinutes * 60 * 1000;
    return (Date.now() - this.lastActivity) > maxAgeMs;
  }

  clear() {
    this.realToPlaceholder.clear();
    this.placeholderToReal.clear();
    this.sessionLiteralSet?.clear();
    this.sessionInputText = '';
    for (const key of Object.keys(this.counters)) {
      if (key === 'US_PHONE') {
        this.counters[key] = 100;
      } else if (['EMAIL', 'CREDIT_CARD', 'PAN', 'HOST'].includes(key)) {
        this.counters[key] = 0;
      } else {
        this.counters[key] = 1;
      }
    }
    this.lastActivity = Date.now();
  }

  getOrCreatePlaceholder(realValue, type = 'KEY', category = 'SECRETS', metadata = {}) {
    if (this.isExpired()) {
      this.clear();
    }
    this.lastActivity = Date.now();

    // 1. Phone number normalization (so +91 98765 43210 and 09876543210 and 98765-43210 share 1 vault slot)
    let lookupKey = realValue;
    if (type === 'INDIA_PHONE') {
      const digits10 = realValue.replace(/\D/g, '').slice(-10);
      lookupKey = `IN_PHONE_${digits10}`;
    }

    if (this.realToPlaceholder.has(lookupKey)) {
      const basePlaceholder = this.realToPlaceholder.get(lookupKey);
      if (type === 'INDIA_PHONE') {
        return this._formatIndiaPhone(basePlaceholder, realValue);
      }
      if (type === 'AADHAAR' && metadata.separator !== undefined) {
        return this._formatAadhaar(basePlaceholder, metadata.separator);
      }
      return basePlaceholder;
    }

    // 2. Generate unique collision-free placeholder
    let basePlaceholder = '';
    let attempts = 0;

    while (attempts < 1000) {
      attempts++;
      basePlaceholder = this._generateCandidate(type, category, metadata);
      const inLiteralSet = this.sessionLiteralSet && this.sessionLiteralSet.has(basePlaceholder);
      const inSessionText = this.sessionInputText && this.sessionInputText.includes(basePlaceholder);
      const collidesWithSession = inLiteralSet || inSessionText;
      if (!this.realToPlaceholder.has(basePlaceholder) && !this.placeholderToReal.has(basePlaceholder) && !collidesWithSession) {
        break;
      }
    }

    // Store mapping
    this.realToPlaceholder.set(lookupKey, basePlaceholder);
    if (lookupKey !== realValue) {
      this.realToPlaceholder.set(realValue, basePlaceholder);
    }

    this.placeholderToReal.set(basePlaceholder, {
      realValue,
      type,
      category,
      createdAt: Date.now()
    });

    if (type === 'INDIA_PHONE') {
      const formatted = this._formatIndiaPhone(basePlaceholder, realValue);
      // Also register formatted variant for reverse mapping
      this.placeholderToReal.set(formatted, {
        realValue,
        type,
        category,
        createdAt: Date.now()
      });
      return formatted;
    }

    if (type === 'AADHAAR' && metadata.separator !== undefined) {
      const formatted = this._formatAadhaar(basePlaceholder, metadata.separator);
      this.placeholderToReal.set(formatted, {
        realValue,
        type,
        category,
        createdAt: Date.now()
      });
      return formatted;
    }

    return basePlaceholder;
  }

  _generateCandidate(type, category, metadata) {
    switch (type) {
      case 'EMAIL': {
        const letter = indexToLetterSequence(this.counters.EMAIL++);
        return `user_${letter}@example.com`;
      }
      case 'URL_USER': {
        const id = this.counters.URL_USER++;
        return `urluser_${id}`;
      }
      case 'LOCAL_USER': {
        const id = this.counters.LOCAL_USER++;
        return `localuser_${id}`;
      }
      case 'IPV4': {
        const id = this.counters.IPV4++;
        const adjusted = id - 1;
        const octet3 = Math.floor(adjusted / 254) % 256;
        const octet4 = (adjusted % 254) + 1;
        return `10.0.${octet3}.${octet4}`;
      }
      case 'IPV6': {
        const id = this.counters.IPV6++;
        return `2001:db8::${id.toString(16)}`;
      }
      case 'MAC': {
        const id = this.counters.MAC++;
        const hex = (id % 255).toString(16).padStart(2, '0').toUpperCase();
        return `00:00:5E:00:53:${hex}`;
      }
      case 'AWS_KEY': {
        if (!this.options.useTypedPlaceholders) {
          const id = this.counters.KEY++;
          return `REDACTED_KEY_${id}`;
        }
        const id = this.counters.AWS_KEY++;
        return `REDACTED_AWS_KEY_${id}`;
      }
      case 'GITHUB_TOKEN': {
        if (!this.options.useTypedPlaceholders) {
          const id = this.counters.KEY++;
          return `REDACTED_KEY_${id}`;
        }
        const id = this.counters.GITHUB_TOKEN++;
        return `REDACTED_GITHUB_TOKEN_${id}`;
      }
      case 'STRIPE_KEY': {
        if (!this.options.useTypedPlaceholders) {
          const id = this.counters.KEY++;
          return `REDACTED_KEY_${id}`;
        }
        const id = this.counters.STRIPE_KEY++;
        return `REDACTED_STRIPE_KEY_${id}`;
      }
      case 'SLACK_TOKEN': {
        if (!this.options.useTypedPlaceholders) {
          const id = this.counters.KEY++;
          return `REDACTED_KEY_${id}`;
        }
        const id = this.counters.SLACK_TOKEN++;
        return `REDACTED_SLACK_TOKEN_${id}`;
      }
      case 'GOOGLE_KEY': {
        if (!this.options.useTypedPlaceholders) {
          const id = this.counters.KEY++;
          return `REDACTED_KEY_${id}`;
        }
        const id = this.counters.GOOGLE_KEY++;
        return `REDACTED_GOOGLE_KEY_${id}`;
      }
      case 'JWT': {
        const id = this.counters.JWT++;
        return `REDACTED_JWT_${id}`;
      }
      case 'KEY': {
        const id = this.counters.KEY++;
        return `REDACTED_KEY_${id}`;
      }
      case 'INDIA_PHONE': {
        // Base 10-digit Indian synthetic mobile starting with 5 (non-routable)
        const id = this.counters.INDIA_PHONE++;
        const seq = id.toString().padStart(5, '0');
        return `50000${seq}`;
      }
      case 'US_PHONE':
      case 'PHONE': {
        const id = this.counters.US_PHONE++;
        const suffix = (id % 100).toString().padStart(4, '0');
        return `+1-555-01${suffix.slice(-2)}`;
      }
      case 'CREDIT_CARD': {
        const id = this.counters.CREDIT_CARD++;
        return generateDeterministicLuhnCard(id);
      }
      case 'SSN': {
        const id = this.counters.SSN++;
        const s = id.toString().padStart(4, '0');
        return `000-12-${s.slice(-4)}`;
      }
      case 'AADHAAR': {
        const id = this.counters.AADHAAR++;
        const s = id.toString().padStart(4, '0');
        return `99990000${s.slice(-4)}`;
      }
      case 'PAN': {
        const id = this.counters.PAN++;
        const numPart = (1000 + (id % 8999)).toString().slice(-4);
        const letter = indexToLetterSequence(id % 26);
        return `AAAAA${numPart}${letter}`;
      }
      case 'HOST': {
        const letter = indexToLetterSequence(this.counters.HOST++);
        return `host_${letter}.example.internal`;
      }
      case 'IBAN': {
        const id = this.counters.IBAN++;
        const seq = id.toString().padStart(10, '0');
        return `GB00TEST${seq}`;
      }
      case 'CUSTOM': {
        const id = this.counters.CUSTOM++;
        const tpl = metadata.template || 'CUSTOM_TOKEN_{N}';
        return tpl.replace('{N}', id.toString());
      }
      default: {
        const id = this.counters.KEY++;
        return `REDACTED_KEY_${id}`;
      }
    }
  }

  _formatIndiaPhone(raw10Digits, originalText) {
    const first5 = raw10Digits.slice(0, 5);
    const last5 = raw10Digits.slice(5);

    if (originalText.startsWith('+91')) {
      const sep = originalText.includes('-') ? '-' : (originalText.includes(' ') ? ' ' : '');
      return `+91 ${first5}${sep || ' '}${last5}`;
    }
    if (originalText.startsWith('0')) {
      return `0${first5}${originalText.includes('-') ? '-' : (originalText.includes(' ') ? ' ' : '')}${last5}`;
    }
    if (originalText.includes('-')) {
      return `${first5}-${last5}`;
    }
    if (originalText.includes(' ')) {
      return `${first5} ${last5}`;
    }
    return raw10Digits;
  }

  _formatAadhaar(raw12Digits, separator) {
    const p1 = raw12Digits.slice(0, 4);
    const p2 = raw12Digits.slice(4, 8);
    const p3 = raw12Digits.slice(8, 12);
    const sep = separator !== undefined ? separator : ' ';
    return `${p1}${sep}${p2}${sep}${p3}`;
  }

  getRealValue(placeholder) {
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    const entry = this.placeholderToReal.get(placeholder);
    return entry ? entry.realValue : null;
  }

  deleteEntry(key) {
    if (this.placeholderToReal.has(key)) {
      const entry = this.placeholderToReal.get(key);
      this.placeholderToReal.delete(key);
      this.realToPlaceholder.delete(entry.realValue);
      return true;
    }
    if (this.realToPlaceholder.has(key)) {
      const placeholder = this.realToPlaceholder.get(key);
      this.realToPlaceholder.delete(key);
      this.placeholderToReal.delete(placeholder);
      return true;
    }
    return false;
  }

  getAllEntries() {
    const list = [];
    for (const [placeholder, meta] of this.placeholderToReal.entries()) {
      list.push({
        placeholder,
        realValue: meta.realValue,
        type: meta.type,
        category: meta.category,
        createdAt: meta.createdAt
      });
    }
    return list;
  }

  toJSON() {
    return {
      entries: this.getAllEntries(),
      counters: { ...this.counters },
      lastActivity: this.lastActivity,
      options: { ...this.options }
    };
  }

  fromJSON(json) {
    this.clear();
    if (!json) return;
    if (json.counters) {
      this.counters = { ...this.counters, ...json.counters };
    }
    if (json.lastActivity) {
      this.lastActivity = json.lastActivity;
    }
    if (json.options) {
      this.options = { ...this.options, ...json.options };
    }
    if (Array.isArray(json.entries)) {
      for (const item of json.entries) {
        this.realToPlaceholder.set(item.realValue, item.placeholder);
        this.placeholderToReal.set(item.placeholder, {
          realValue: item.realValue,
          type: item.type,
          category: item.category,
          createdAt: item.createdAt || Date.now()
        });
      }
    }
  }

  async saveToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      try {
        await chrome.storage.session.set({
          smart_pii_vault: this.toJSON()
        });
      } catch (err) {
        console.warn('[Smart PII Sanitizer] Failed to save vault to storage:', err);
      }
    }
  }

  async loadFromStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      try {
        const res = await chrome.storage.session.get('smart_pii_vault');
        if (res && res.smart_pii_vault) {
          this.fromJSON(res.smart_pii_vault);
        }
      } catch (err) {
        console.warn('[Smart PII Sanitizer] Failed to load vault from storage:', err);
      }
    }
  }
}
