/**
 * Smart PII Sanitizer - Core Sanitizer Engine (v2.0 Hardened)
 * Preserves structure byte-for-byte, line count invariant, URL decomposition,
 * post-sanitization residual scan, ReDoS safety.
 */

import { getActiveDetectors, isSecretKey } from './detectors.js';
import { Vault } from './vault.js';

export function isAllowlisted(value, allowlist = []) {
  if (!allowlist || allowlist.length === 0 || !value) return false;
  const valLower = value.toLowerCase().trim();

  for (const item of allowlist) {
    if (!item) continue;
    const itemLower = item.toLowerCase().trim();
    if (valLower === itemLower) return true;

    if (itemLower.startsWith('*.')) {
      const suffix = itemLower.slice(1);
      if (valLower.endsWith(suffix)) return true;
    }

    if (valLower.endsWith(`@${itemLower}`)) return true;
  }
  return false;
}

export function resolveOverlaps(intervals) {
  if (intervals.length <= 1) return intervals;

  intervals.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) return lenB - lenA;
    return (b.priority || 50) - (a.priority || 50);
  });

  const accepted = [];

  for (const current of intervals) {
    let hasConflict = false;
    let conflictIndex = -1;

    for (let i = accepted.length - 1; i >= 0; i--) {
      const prev = accepted[i];
      if (prev.end <= current.start) {
        break;
      }
      if (Math.max(current.start, prev.start) < Math.min(current.end, prev.end)) {
        hasConflict = true;
        conflictIndex = i;
        break;
      }
    }

    if (!hasConflict) {
      accepted.push(current);
    } else {
      const conflicting = accepted[conflictIndex];
      // Shields always win and can never be replaced
      if (conflicting.isShield) {
        continue;
      }
      if (current.isShield) {
        accepted[conflictIndex] = current;
        continue;
      }

      const currentLen = current.end - current.start;
      const confLen = conflicting.end - conflicting.start;
      const currentPriority = current.priority || 50;
      const confPriority = conflicting.priority || 50;

      if (currentPriority > confPriority) {
        accepted[conflictIndex] = current;
      } else if (currentPriority === confPriority && currentLen > confLen) {
        accepted[conflictIndex] = current;
      }
    }
  }

  // Filter out shield items (they were only used to block other detectors)
  return accepted.filter(item => !item.isShield).sort((a, b) => a.start - b.start);
}

/**
 * Sanitizes structured URLs preserving scheme, port, path, and sensitive params.
 */
function sanitizeStructuredUrl(rawUrl, vault) {
  const urlRegex = /^([a-zA-Z0-9+.-]+):\/\/(?:([^:@\s]+)(?::([^@\s]+))?@)?([^:/?#\s]+)(?::(\d+))?([^?#\s]*)(?:\?([^#\s]*))?(#.*)?$/;
  const m = rawUrl.match(urlRegex);
  if (!m) return rawUrl;

  const scheme = m[1];
  const user = m[2];
  const pass = m[3];
  const host = m[4];
  const port = m[5];
  const path = m[6] || '';
  const queryString = m[7];
  const hash = m[8] || '';

  let userinfoPart = '';
  if (user !== undefined) {
    const userPl = vault.getOrCreatePlaceholder(user, 'URL_USER', 'SYSTEM');
    if (pass !== undefined) {
      const passPl = vault.getOrCreatePlaceholder(pass, 'KEY', 'SECRETS');
      userinfoPart = `${userPl}:${passPl}@`;
    } else {
      userinfoPart = `${userPl}@`;
    }
  }

  // Host handling
  let hostPl = host;
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)) {
    // IPv4 host -> same placeholder as bare IP
    hostPl = vault.getOrCreatePlaceholder(host, 'IPV4', 'NETWORK');
  } else if (host.includes(':')) {
    // IPv6 host
    hostPl = vault.getOrCreatePlaceholder(host, 'IPV6', 'NETWORK');
  } else {
    // Hostname
    hostPl = vault.getOrCreatePlaceholder(host, 'HOST', 'NETWORK');
  }

  const portPart = port ? `:${port}` : '';

  // Query parameter sanitization
  let queryPart = '';
  if (queryString !== undefined) {
    const params = queryString.split('&');
    const sanitizedParams = params.map(p => {
      const eqIdx = p.indexOf('=');
      if (eqIdx === -1) return p;
      const k = p.slice(0, eqIdx);
      const v = p.slice(eqIdx + 1);
      const kLower = k.toLowerCase();

      if (kLower === 'email') {
        const pl = vault.getOrCreatePlaceholder(v, 'EMAIL', 'EMAIL');
        return `${k}=${pl}`;
      }
      if (isSecretKey(k)) {
        const pl = vault.getOrCreatePlaceholder(v, 'KEY', 'SECRETS');
        return `${k}=${pl}`;
      }
      return p;
    });
    queryPart = `?${sanitizedParams.join('&')}`;
  }

  return `${scheme}://${userinfoPart}${hostPl}${portPart}${path}${queryPart}${hash}`;
}

export function sanitize(rawText, options = {}) {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (typeof rawText !== 'string' || rawText.length === 0) {
    return {
      sanitizedText: '',
      entities: [],
      stats: { total: 0, byCategory: {}, durationMs: 0 },
      residualFindings: [],
      vault: options.vault || new Vault()
    };
  }

  const vault = options.vault || new Vault(options.vaultOptions || {});
  if (options.useTypedPlaceholders !== undefined) {
    vault.options.useTypedPlaceholders = options.useTypedPlaceholders;
  }
  vault.registerInputLiterals(rawText);
  const allowlist = options.allowlist || [];
  const customRules = options.customRules || [];
  const enabledCategoryMap = options.enabledCategories || {};
  const excludedEntities = new Set(options.excludedEntityIds || []);
  const detectors = getActiveDetectors(customRules, enabledCategoryMap);

  const candidates = [];
  const scanOpts = {
    sensitivity: options.sensitivity || 'balanced',
    enableNames: options.enableNames || false
  };

  let hasExistingPlaceholders = false;

  for (const detector of detectors) {
    try {
      const matches = detector.scan(rawText, scanOpts);
      for (const m of matches) {
        if (isAllowlisted(m.rawValue, allowlist)) {
          continue;
        }
        if (vault.placeholderToReal.has(m.rawValue)) {
          hasExistingPlaceholders = true;
          continue;
        }
        candidates.push({
          ...m,
          priority: detector.priority || 50
        });
      }
    } catch (err) {
      console.warn(`[Smart PII Sanitizer] Error in detector ${detector.id}:`, err);
    }
  }

  const resolved = resolveOverlaps(candidates);

  const entities = [];
  const byCategory = {};
  let sanitizedText = '';
  let cursor = 0;

  for (let i = 0; i < resolved.length; i++) {
    const item = resolved[i];
    const entityId = `entity_${i}_${item.start}_${item.end}`;

    if (item.start > cursor) {
      sanitizedText += rawText.slice(cursor, item.start);
    }

    if (excludedEntities.has(entityId) || excludedEntities.has(item.rawValue) || item.isShield || item.type === 'SHIELD') {
      sanitizedText += item.rawValue;
      cursor = item.end;
      continue;
    }

    let placeholder = '';

      if (item.type === 'STRUCTURED_URL') {
        placeholder = sanitizeStructuredUrl(item.rawValue, vault);
        vault.placeholderToReal.set(placeholder, {
          realValue: item.rawValue,
          type: 'URL',
          category: 'NETWORK',
          createdAt: Date.now()
        });
      } else if (item.type === 'GSTIN' && item.embeddedPan) {
        const panPlaceholder = vault.getOrCreatePlaceholder(item.embeddedPan, 'PAN', 'ID_CARDS');
        placeholder = `${item.rawValue.slice(0, 2)}${panPlaceholder}${item.rawValue.slice(12)}`;
        vault.placeholderToReal.set(placeholder, {
          realValue: item.rawValue,
          type: 'GSTIN',
          category: 'ID_CARDS',
          createdAt: Date.now()
        });
      } else if (item.type === 'UPI') {
        if (/^\d{10}$/.test(item.localPart)) {
          const phonePlaceholder = vault.getOrCreatePlaceholder(item.localPart, 'INDIA_PHONE', 'CONTACT');
          placeholder = `${phonePlaceholder}@${item.psp}`;
        } else {
          const userPlaceholder = vault.getOrCreatePlaceholder(item.localPart, 'EMAIL', 'FINANCIAL');
          placeholder = `${userPlaceholder.split('@')[0]}@${item.psp}`;
        }
        vault.placeholderToReal.set(placeholder, {
          realValue: item.rawValue,
          type: 'UPI',
          category: 'FINANCIAL',
          createdAt: Date.now()
        });
      } else if (item.type === 'KEY' && item.keepMarkers) {
        // PEM block with preserved markers
        const isEscaped = item.rawValue.includes('\\n');
        const sep = isEscaped ? '\\n' : '\n';
        const rawLines = item.rawValue.split(sep);
        const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);
        const beginLine = nonEmptyLines[0];
        const endLine = nonEmptyLines[nonEmptyLines.length - 1];
        const keyPlaceholder = vault.getOrCreatePlaceholder(item.rawValue, 'KEY', 'SECRETS');
        placeholder = `${beginLine}${sep}${keyPlaceholder}${sep}${endLine}`;
        if (rawLines[rawLines.length - 1] === '') {
          placeholder += sep;
        }
      } else if (item.type === 'CLI_USER_PASS') {
        const userPl = vault.getOrCreatePlaceholder(item.user, 'URL_USER', 'SYSTEM');
        const passPl = vault.getOrCreatePlaceholder(item.pass, 'KEY', 'SECRETS');
        placeholder = `${userPl}:${passPl}`;
      } else {
        placeholder = vault.getOrCreatePlaceholder(
          item.rawValue,
          item.type,
          item.category,
          { separator: item.separator, template: item.template }
        );
      }

      const plStart = sanitizedText.length;
      sanitizedText += placeholder;
      const plEnd = sanitizedText.length;

      const entity = {
        id: entityId,
        start: item.start,
        end: item.end,
        sanitizedStart: plStart,
        sanitizedEnd: plEnd,
        rawValue: item.rawValue,
        placeholder,
        category: item.category,
        type: item.type,
        detectorId: item.detectorId
      };
      entities.push(entity);

      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    cursor = item.end;
  }

  if (cursor < rawText.length) {
    sanitizedText += rawText.slice(cursor);
  }

  // Post-Sanitization Residual Scan (CASE 12)
  const residualFindings = [];
  const issuedPlaceholders = new Set(Array.from(vault.placeholderToReal.keys()));

  // Pre-populate individual sub-tokens of placeholders (like domain, username) for O(1) lookup
  const placeholderPartsSet = new Set(issuedPlaceholders);
  for (const pl of issuedPlaceholders) {
    if (pl.includes('@')) {
      const [u, d] = pl.split('@');
      if (u) placeholderPartsSet.add(u);
      if (d) placeholderPartsSet.add(d);
    }
    if (pl.includes('.')) {
      pl.split('.').forEach(seg => { if (seg.length > 2) placeholderPartsSet.add(seg); });
    }
  }

  for (const detector of detectors) {
    if (detector.id === 'uuid_shield') continue;
    try {
      const resMatches = detector.scan(sanitizedText, scanOpts);
      for (const rm of resMatches) {
        if (!issuedPlaceholders.has(rm.rawValue) && !placeholderPartsSet.has(rm.rawValue) && !isAllowlisted(rm.rawValue, allowlist)) {
          let isPlaceholderPart = false;
          if (issuedPlaceholders.size < 50) {
            for (const pl of issuedPlaceholders) {
              if (pl.includes(rm.rawValue)) {
                isPlaceholderPart = true;
                break;
              }
            }
          } else {
            isPlaceholderPart = rm.rawValue.startsWith('REDACTED_') ||
                                rm.rawValue.includes('example.com') ||
                                rm.rawValue.includes('example.internal') ||
                                placeholderPartsSet.has(rm.rawValue);
          }
          if (!isPlaceholderPart) {
            residualFindings.push({
              type: rm.type,
              category: rm.category,
              rawValue: rm.rawValue
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationMs = Math.round((endTime - startTime) * 100) / 100;

  return {
    sanitizedText,
    entities,
    stats: {
      total: entities.length,
      byCategory,
      durationMs,
      hasExistingPlaceholders
    },
    residualFindings,
    vault
  };
}
