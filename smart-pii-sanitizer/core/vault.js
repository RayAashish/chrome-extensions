/**
 * Smart PII Sanitizer - Bidirectional Vault (v2.0 Hardened)
 * Separate namespaces, deterministic formatting, collision-safe.
 */

import {
  indexToLetterSequence,
  generateDeterministicLuhnCard
} from './detectors.js';

export const DEFAULT_PLACEHOLDER_STYLES = {
  // TAG style defaults (as specified in Section 3.A):
  SECRETS: 'TAG',           // REDACTED_KEY_1
  KEY: 'TAG',               // REDACTED_KEY_1
  AADHAAR: 'TAG',           // REDACTED_AADHAAR_1
  SSN: 'TAG',               // REDACTED_SSN_1
  CREDIT_CARD: 'TAG',       // REDACTED_CARD_1
  BANK_ACCOUNT: 'TAG',      // REDACTED_ACCOUNT_1
  ACCOUNT: 'TAG',           // REDACTED_ACCOUNT_1
  PASSPORT: 'TAG',          // REDACTED_PASSPORT_1
  DRIVING_LICENSE: 'TAG',   // REDACTED_LICENSE_1
  LICENSE: 'TAG',           // REDACTED_LICENSE_1
  VOTER_ID: 'TAG',          // REDACTED_VOTER_ID_1
  ID_CARDS: 'TAG',          // Fallback default for national IDs

  // FORMAT-VALID defaults:
  EMAIL: 'FORMAT_VALID',    // user_A@example.com
  IPV4: 'FORMAT_VALID',     // 10.0.0.1
  IPV6: 'FORMAT_VALID',     // 2001:db8::1
  HOST: 'FORMAT_VALID',     // host_A.example.internal
  US_PHONE: 'FORMAT_VALID', // +1-555-0100
  INDIA_PHONE: 'FORMAT_VALID', // 50000 00001
  PHONE: 'FORMAT_VALID',
  PAN: 'FORMAT_VALID',      // AAAAA1000A
  URL_USER: 'FORMAT_VALID', // urluser_1
  LOCAL_USER: 'FORMAT_VALID'
};

/**
 * Mask real values for assisted mapping popover and diagnostics
 * Adheres to UIDAI standard for Aadhaar: first 8 digits hidden, last 4 revealed (XXXX XXXX 7644)
 */
export function maskRealValue(realValue, type = '') {
  if (typeof realValue !== 'string') return '••••••••';
  const clean = realValue.trim();

  if (type === 'AADHAAR' || /aadhaar/i.test(type)) {
    const digits = clean.replace(/\D/g, '');
    const last4 = digits.slice(-4) || 'XXXX';
    return `XXXX XXXX ${last4}`;
  }

  if (type === 'CREDIT_CARD' || /card/i.test(type)) {
    const digits = clean.replace(/\D/g, '');
    const last4 = digits.slice(-4) || 'XXXX';
    return `**** **** **** ${last4}`;
  }

  if (type === 'PAN' || /pan/i.test(type)) {
    const last4 = clean.slice(-4);
    return `******${last4}`;
  }

  if (type === 'EMAIL' || clean.includes('@')) {
    const [user, domain] = clean.split('@');
    const first = user ? user[0] : '';
    return `${first}***@${domain || 'example.com'}`;
  }

  if (type === 'SSN') {
    const digits = clean.replace(/\D/g, '');
    const last4 = digits.slice(-4) || 'XXXX';
    return `XXX-XX-${last4}`;
  }

  if (type === 'PHONE' || type === 'US_PHONE' || type === 'INDIA_PHONE') {
    const digits = clean.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `+**-***-**${last4}`;
  }

  return '••••••••';
}

const PLACEHOLDER_LITERAL_REGEX = /(?:REDACTED_[A-Z0-9_]+|user_[A-Za-z]+@example\.com|10\.0\.\d{1,3}\.\d{1,3}|2001:db8::[0-9a-fA-F]+|00:00:5E:00:53:[0-9a-fA-F]{2}|(?:urluser|localuser)_\d+|\+1-555-01\d{2}|50000\d{5}|4111-1111-1111-\d{4}|000-12-\d{4}|9999\s?0000\s?\d{4}|[A-Z]{5}[0-9]{4}[A-Z]|host_[A-Za-z0-9_.-]+\.example\.internal|GB00TEST[0-9A-Z]{10})/g;

export class Vault {
  constructor(options = {}) {
    this.realToPlaceholder = new Map();
    this.placeholderToReal = new Map();
    this.aliases = new Map(); // aliasToken -> targetPlaceholder

    // Counters per namespace
    this.counters = {
      EMAIL: 0,
      EMAIL_TAG: 1,
      URL_USER: 1,    // urluser_1, urluser_2
      LOCAL_USER: 1,  // localuser_1, localuser_2
      IPV4: 1,        // 10.0.0.1, 10.0.0.2
      IP_TAG: 1,      // REDACTED_IP_1
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
      PHONE_TAG: 1,   // REDACTED_PHONE_1
      INDIA_PHONE: 1, // 5000000001
      CREDIT_CARD: 0, // 4111-1111-1111-xxxx
      CARD_TAG: 1,    // REDACTED_CARD_1
      SSN: 1,         // 000-12-0001
      SSN_TAG: 1,     // REDACTED_SSN_1
      AADHAAR: 1,     // 9999 0000 0001
      AADHAAR_TAG: 1, // REDACTED_AADHAAR_1
      PAN: 0,         // AAAAA0000A
      PAN_TAG: 1,     // REDACTED_PAN_1
      PASSPORT_TAG: 1,// REDACTED_PASSPORT_1
      ACCOUNT_TAG: 1, // REDACTED_ACCOUNT_1
      LICENSE_TAG: 1, // REDACTED_LICENSE_1
      VOTER_ID_TAG: 1,// REDACTED_VOTER_ID_1
      HOST: 0,        // host_A.example.internal
      IBAN: 1,        // GB00TEST0000000001
      CUSTOM: 1
    };

    this.sessionLiteralSet = new Set();
    this.sessionInputText = '';

    this.options = {
      autoExpireMinutes: options.autoExpireMinutes || 0,
      placeholderStyles: { ...DEFAULT_PLACEHOLDER_STYLES, ...(options.placeholderStyles || {}) },
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
    this.aliases.clear();
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

  getPlaceholderStyle(type, category) {
    if (this.options && this.options.placeholderStyles) {
      if (this.options.placeholderStyles[type]) {
        return this.options.placeholderStyles[type];
      }
      if (category && this.options.placeholderStyles[category]) {
        return this.options.placeholderStyles[category];
      }
    }
    return DEFAULT_PLACEHOLDER_STYLES[type] || (category ? DEFAULT_PLACEHOLDER_STYLES[category] : null) || 'TAG';
  }

  setPlaceholderStyles(styles = {}) {
    this.options = this.options || {};
    this.options.placeholderStyles = { ...(this.options.placeholderStyles || {}), ...styles };
    this.lastActivity = Date.now();
  }

  addAlias(aliasToken, targetPlaceholder) {
    if (!aliasToken || !targetPlaceholder) return;
    this.aliases.set(aliasToken, targetPlaceholder);
    this.lastActivity = Date.now();
  }

  getAliases() {
    return Array.from(this.aliases.entries());
  }

  deleteAlias(aliasToken) {
    const res = this.aliases.delete(aliasToken);
    this.lastActivity = Date.now();
    return res;
  }

  clearAliases() {
    this.aliases.clear();
    this.lastActivity = Date.now();
  }

  getOrCreatePlaceholder(realValue, type = 'KEY', category = 'SECRETS', metadata = {}) {
    if (this.isExpired()) {
      this.clear();
    }
    this.lastActivity = Date.now();

    // 1. Phone number and Aadhaar normalization
    let lookupKey = realValue;
    if (type === 'INDIA_PHONE') {
      const digits10 = realValue.replace(/\D/g, '').slice(-10);
      lookupKey = `IN_PHONE_${digits10}`;
    } else if (type === 'AADHAAR') {
      const digits12 = realValue.replace(/\D/g, '');
      lookupKey = `AADHAAR_${digits12}`;
    }

    const style = (metadata && metadata.placeholderStyle) || this.getPlaceholderStyle(type, category);

    if (this.realToPlaceholder.has(lookupKey)) {
      const basePlaceholder = this.realToPlaceholder.get(lookupKey);
      let placeholder = basePlaceholder;
      if (style === 'FORMAT_VALID') {
        if (type === 'INDIA_PHONE') {
          placeholder = this._formatIndiaPhone(basePlaceholder, realValue);
        } else if (type === 'AADHAAR') {
          placeholder = this._formatAadhaar(basePlaceholder, metadata.separator);
        }
      }
      this.placeholderToReal.set(placeholder, {
        realValue,
        type,
        category,
        createdAt: Date.now()
      });
      return placeholder;
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

    // Store mapping - always store the canonical basePlaceholder in realToPlaceholder
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

    if (style === 'FORMAT_VALID') {
      if (type === 'INDIA_PHONE') {
        const formatted = this._formatIndiaPhone(basePlaceholder, realValue);
        this.placeholderToReal.set(formatted, {
          realValue,
          type,
          category,
          createdAt: Date.now()
        });
        const raw10 = basePlaceholder.replace(/\D/g, '').slice(-10);
        const first5 = raw10.slice(0, 5);
        const last5 = raw10.slice(5);
        this.placeholderToReal.set(`${first5} ${last5}`, { realValue, type, category, createdAt: Date.now() });
        this.placeholderToReal.set(`${first5}-${last5}`, { realValue, type, category, createdAt: Date.now() });
        this.placeholderToReal.set(`+91 ${first5} ${last5}`, { realValue, type, category, createdAt: Date.now() });
        this.placeholderToReal.set(`+91-${first5}-${last5}`, { realValue, type, category, createdAt: Date.now() });
        return formatted;
      }

      if (type === 'AADHAAR') {
        const formatted = this._formatAadhaar(basePlaceholder, metadata.separator);
        this.placeholderToReal.set(formatted, {
          realValue,
          type,
          category,
          createdAt: Date.now()
        });
        const raw12 = basePlaceholder.replace(/\D/g, '');
        const p1 = raw12.slice(0, 4);
        const p2 = raw12.slice(4, 8);
        const p3 = raw12.slice(8, 12);
        this.placeholderToReal.set(`${p1} ${p2} ${p3}`, { realValue, type, category, createdAt: Date.now() });
        this.placeholderToReal.set(`${p1}-${p2}-${p3}`, { realValue, type, category, createdAt: Date.now() });
        this.placeholderToReal.set(raw12, { realValue, type, category, createdAt: Date.now() });
        return formatted;
      }
    }

    return basePlaceholder;
  }

  _generateCandidate(type, category, metadata) {
    const style = (metadata && metadata.placeholderStyle) || this.getPlaceholderStyle(type, category);

    // TAG style: uppercase ASCII letters, digits, underscores only, NO spaces or punctuation inside
    if (style === 'TAG') {
      switch (type) {
        case 'AADHAAR':
          return `REDACTED_AADHAAR_${this.counters.AADHAAR_TAG++}`;
        case 'CREDIT_CARD':
          return `REDACTED_CARD_${this.counters.CARD_TAG++}`;
        case 'SSN':
          return `REDACTED_SSN_${this.counters.SSN_TAG++}`;
        case 'PAN':
          return `REDACTED_PAN_${this.counters.PAN_TAG++}`;
        case 'PASSPORT':
          return `REDACTED_PASSPORT_${this.counters.PASSPORT_TAG++}`;
        case 'BANK_ACCOUNT':
        case 'ACCOUNT':
        case 'IBAN':
          return `REDACTED_ACCOUNT_${this.counters.ACCOUNT_TAG++}`;
        case 'DRIVING_LICENSE':
        case 'LICENSE':
          return `REDACTED_LICENSE_${this.counters.LICENSE_TAG++}`;
        case 'VOTER_ID':
          return `REDACTED_VOTER_ID_${this.counters.VOTER_ID_TAG++}`;
        case 'EMAIL':
          return `REDACTED_EMAIL_${this.counters.EMAIL_TAG++}`;
        case 'IPV4':
        case 'IPV6':
          return `REDACTED_IP_${this.counters.IP_TAG++}`;
        case 'US_PHONE':
        case 'INDIA_PHONE':
        case 'PHONE':
          return `REDACTED_PHONE_${this.counters.PHONE_TAG++}`;
        case 'AWS_KEY':
          return this.options.useTypedPlaceholders ? `REDACTED_AWS_KEY_${this.counters.AWS_KEY++}` : `REDACTED_KEY_${this.counters.KEY++}`;
        case 'GITHUB_TOKEN':
          return this.options.useTypedPlaceholders ? `REDACTED_GITHUB_TOKEN_${this.counters.GITHUB_TOKEN++}` : `REDACTED_KEY_${this.counters.KEY++}`;
        case 'STRIPE_KEY':
          return this.options.useTypedPlaceholders ? `REDACTED_STRIPE_KEY_${this.counters.STRIPE_KEY++}` : `REDACTED_KEY_${this.counters.KEY++}`;
        case 'SLACK_TOKEN':
          return this.options.useTypedPlaceholders ? `REDACTED_SLACK_TOKEN_${this.counters.SLACK_TOKEN++}` : `REDACTED_KEY_${this.counters.KEY++}`;
        case 'GOOGLE_KEY':
          return this.options.useTypedPlaceholders ? `REDACTED_GOOGLE_KEY_${this.counters.GOOGLE_KEY++}` : `REDACTED_KEY_${this.counters.KEY++}`;
        case 'JWT':
          return `REDACTED_JWT_${this.counters.JWT++}`;
        default:
          return `REDACTED_KEY_${this.counters.KEY++}`;
      }
    }

    // FORMAT-VALID style
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
    const digitsOnly = String(raw10Digits || '').replace(/\D/g, '').slice(-10);
    const d = digitsOnly.padStart(10, '0');
    const first5 = d.slice(0, 5);
    const last5 = d.slice(5);
    const orig = String(originalText || '');

    if (orig.startsWith('+91')) {
      const sep = orig.includes('-') ? '-' : (orig.includes(' ') ? ' ' : '');
      return `+91 ${first5}${sep || ' '}${last5}`;
    }
    if (orig.startsWith('0')) {
      return `0${first5}${orig.includes('-') ? '-' : (orig.includes(' ') ? ' ' : '')}${last5}`;
    }
    if (orig.includes('-')) {
      return `${first5}-${last5}`;
    }
    if (orig.includes(' ')) {
      return `${first5} ${last5}`;
    }
    return d;
  }

  _formatAadhaar(raw12Digits, separator) {
    const digitsOnly = String(raw12Digits || '').replace(/\D/g, '');
    const d = digitsOnly.padEnd(12, '0');
    const p1 = d.slice(0, 4);
    const p2 = d.slice(4, 8);
    const p3 = d.slice(8, 12);
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
      realToPlaceholder: Array.from(this.realToPlaceholder.entries()),
      aliases: Array.from(this.aliases.entries()),
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
        this.placeholderToReal.set(item.placeholder, {
          realValue: item.realValue,
          type: item.type,
          category: item.category,
          createdAt: item.createdAt || Date.now()
        });
      }
    }
    if (Array.isArray(json.realToPlaceholder)) {
      for (const [k, v] of json.realToPlaceholder) {
        this.realToPlaceholder.set(k, v);
      }
    } else if (Array.isArray(json.entries)) {
      for (const item of json.entries) {
        const existing = this.realToPlaceholder.get(item.realValue);
        if (!existing || item.placeholder.length < existing.length) {
          this.realToPlaceholder.set(item.realValue, item.placeholder);
        }
      }
    }
    if (Array.isArray(json.aliases)) {
      for (const [k, v] of json.aliases) {
        this.aliases.set(k, v);
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
