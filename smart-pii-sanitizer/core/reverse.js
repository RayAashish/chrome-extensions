/**
 * Smart PII Sanitizer - Reverse Map Engine (v2.1 Tolerant & Fast Assisted Mapping)
 * Longest-first ordering, single-pass O(N) fast path for large payloads,
 * LLM instruction stripping, tolerant pattern matching,
 * unrecognized redaction token detection, and round-trip health check.
 */

import { maskRealValue } from './vault.js';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Levenshtein distance for closest-match hints
export function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Strips prepended LLM instruction line if present
 */
export function stripLlmInstructionHeader(text) {
  if (typeof text !== 'string') return '';
  const headerRegex = /(?:^|\r?\n)\s*\[?Note:\s*tokens like[^\n]+(?:anonymization placeholders|do not mask|keep them exactly|intentional)[^\n]*\]?(?:\r?\n|$)/i;
  return text.replace(headerRegex, (match) => {
    return match.startsWith('\n') || match.startsWith('\r\n') ? '\n' : '';
  }).trimStart();
}

/**
 * Infers category from a redaction token
 */
export function inferCategoryFromToken(token) {
  if (!token || typeof token !== 'string') return 'UNKNOWN';
  const t = token.toUpperCase();
  if (/AADHAAR|AADHAR|ADHAAR|ADHAR|UIDAI|\bUID\b/.test(t)) return 'AADHAAR';
  if (/\bPAN\b/.test(t)) return 'PAN';
  if (/SSN|SOCIAL_SECURITY/.test(t)) return 'SSN';
  if (/CARD|CREDIT|DEBIT|CVV/.test(t)) return 'CREDIT_CARD';
  if (/EMAIL|MAIL/.test(t)) return 'EMAIL';
  if (/\bIP\b|IPV4|IPV6/.test(t)) return 'IP';
  if (/PHONE|MOBILE|CELL/.test(t)) return 'PHONE';
  if (/KEY|SECRET|PASSWORD|PASS|TOKEN|CREDENTIAL|AUTH|BEARER|APIKEY/.test(t)) return 'KEY';
  if (/PASSPORT/.test(t)) return 'PASSPORT';
  if (/ACCOUNT|BANK/.test(t)) return 'BANK_ACCOUNT';
  if (/LICENSE|LICENCE/.test(t)) return 'DRIVING_LICENSE';
  return 'UNKNOWN';
}

/**
 * Scans text for unrecognized redaction-like tokens not issued by the vault
 */
export function detectUnrecognizedRedactionTokens(text, vault) {
  if (typeof text !== 'string' || !text) return [];

  const cleaned = stripLlmInstructionHeader(text);
  const issuedPlaceholders = new Set();
  const knownAliases = new Set();

  if (vault) {
    if (typeof vault.getAllEntries === 'function') {
      const all = vault.getAllEntries();
      for (let i = 0; i < all.length; i++) {
        issuedPlaceholders.add(all[i].placeholder);
        issuedPlaceholders.add(all[i].placeholder.toLowerCase());
      }
    }
    if (vault.aliases) {
      for (const [k] of vault.aliases) {
        knownAliases.add(k);
        knownAliases.add(k.toLowerCase());
      }
    }
  }

  const patterns = [
    /\[([A-Za-z0-9_ -]*(?:REDACTED|MASKED|MOCK|ANONYMIZED|PII|AADHAAR|AADHAR|PAN|SSN|EMAIL|PHONE|CARD|SECRET|KEY|CONFIDENTIAL)[A-Za-z0-9_ -]*)\]/gi,
    /<([A-Za-z0-9_ -]*(?:REDACTED|MASKED|MOCK|ANONYMIZED|PII|AADHAAR|AADHAR|PAN|SSN|EMAIL|PHONE|CARD|SECRET|KEY|TOKEN)[A-Za-z0-9_ -]*)>/gi,
    /\{\{([A-Za-z0-9_ -]*(?:AADHAAR|AADHAR|PAN|SSN|EMAIL|PHONE|CARD|SECRET|KEY|TOKEN|PII)[A-Za-z0-9_ -]*)\}\}/gi,
    /(?<![\[<{])\b(REDACTED_[A-Za-z0-9_]+_MOCK)\b(?![\]>}])/gi,
    /(?<![\[<{])\b(REDACTED_[A-Za-z0-9_]+)\b(?![\]>}])/gi,
    /(?<![A-Za-z0-9])(X{4}[\s-]X{4}[\s-](?:\d{4}|X{4}))(?![A-Za-z0-9])/g,
    /(?<![A-Za-z0-9*])(\*{4,})(?![A-Za-z0-9*])/g
  ];

  const foundMap = new Map();

  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(cleaned)) !== null) {
      const fullMatch = m[0].trim();
      if (!fullMatch) continue;

      const lower = fullMatch.toLowerCase();
      if (issuedPlaceholders.has(fullMatch) || issuedPlaceholders.has(lower) ||
          knownAliases.has(fullMatch) || knownAliases.has(lower)) {
        continue;
      }

      if (vault && vault.getRealValue && (vault.getRealValue(fullMatch) || vault.getRealValue(lower))) {
        continue;
      }

      const isPartialMask = /^[X\s-]+$/i.test(fullMatch) ||
                            /^X{4}[\s-]X{4}[\s-]\d{4}$/i.test(fullMatch) ||
                            /^\*{4,}$/.test(fullMatch);
      const inferredCategory = inferCategoryFromToken(fullMatch);

      if (foundMap.has(fullMatch)) {
        foundMap.get(fullMatch).count++;
      } else {
        foundMap.set(fullMatch, {
          token: fullMatch,
          count: 1,
          inferredCategory,
          isPartialMask
        });
      }
    }
  }

  return Array.from(foundMap.values());
}

export function reverseMap(text, vault, options = {}) {
  if (typeof text !== 'string' || text.length === 0 || !vault) {
    return {
      restoredText: text || '',
      restoredCount: 0,
      stats: { restoredCount: 0 },
      details: [],
      unmatchedPlaceholders: [],
      healthCheck: {
        issuedCount: 0,
        foundCount: 0,
        restoredCount: 0,
        missingCount: 0,
        unrecognizedCount: 0,
        missing: [],
        unrecognized: [],
        correlationHints: [],
        status: 'green'
      }
    };
  }

  // 1. Strip instruction header if present
  let restoredText = stripLlmInstructionHeader(text);
  let restoredCount = 0;
  const details = [];
  const restoredPerEntry = new Map(); // placeholder -> count

  // 2. Gather vault entries and aliases
  const entries = vault.getAllEntries();
  const allReplacementItems = [];

  if (vault.aliases) {
    for (const [aliasToken, targetPl] of vault.aliases.entries()) {
      const realVal = vault.getRealValue(targetPl);
      if (realVal) {
        allReplacementItems.push({
          placeholder: aliasToken,
          realValue: realVal,
          type: 'ALIAS',
          targetPlaceholder: targetPl,
          isAlias: true
        });
      }
    }
  }

  for (const e of entries) {
    allReplacementItems.push({
      ...e,
      isAlias: false
    });
  }

  // FAST PATH: When there are many entries (> 50), use single-pass O(N) token replacement
  if (allReplacementItems.length > 50) {
    const exactMap = new Map();
    const lowerMap = new Map();

    for (const e of allReplacementItems) {
      exactMap.set(e.placeholder, e);
      lowerMap.set(e.placeholder.toLowerCase(), e);
    }

    const placeholderPattern = /(?:\[REDACTED_[A-Za-z0-9_]+\]|<REDACTED_[A-Za-z0-9_]+>|REDACTED_[A-Za-z0-9_]+|user_[A-Za-z0-9_]+(?:\s*@\s*|\s*\[at\]\s*|@)example\.com|10\.0\.\d{1,3}\.\d{1,3}|2001:db8::[0-9a-fA-F]+|00:00:5E:00:53:[0-9a-fA-F]{2}|(?:urluser|localuser)_\d+|\+1[\s-]*555[\s-]*01\d{2}|50000[\s-]*\d{5}|4111[\s-]*1111[\s-]*1111[\s-]*\d{4}|000[\s-]*12[\s-]*\d{4}|9999[\s-]*0000[\s-]*\d{4}|9999[\s-]*000[\s-]*0[\s-]*\d{2}|[A-Z]{5}[0-9]{4}[A-Z]|host_[A-Za-z0-9_.-]+\.example\.internal|GB00TEST[0-9A-Z]{10}|CUSTOM_[A-Za-z0-9_]+)/gi;

    const countByPl = new Map();
    const fuzzyByPl = new Map();

    restoredText = restoredText.replace(placeholderPattern, (match) => {
      // Check exact match
      if (exactMap.has(match)) {
        const item = exactMap.get(match);
        countByPl.set(item.placeholder, (countByPl.get(item.placeholder) || 0) + 1);
        restoredCount++;
        const trackingKey = item.isAlias ? item.targetPlaceholder : item.placeholder;
        restoredPerEntry.set(trackingKey, (restoredPerEntry.get(trackingKey) || 0) + 1);
        return item.realValue;
      }

      // Check bracketed match: [REDACTED_...] or <REDACTED_...>
      let cleanMatch = match;
      if ((match.startsWith('[') && match.endsWith(']')) || (match.startsWith('<') && match.endsWith('>'))) {
        cleanMatch = match.slice(1, -1);
        if (exactMap.has(cleanMatch)) {
          const item = exactMap.get(cleanMatch);
          fuzzyByPl.set(item.placeholder, (fuzzyByPl.get(item.placeholder) || 0) + 1);
          restoredCount++;
          const trackingKey = item.isAlias ? item.targetPlaceholder : item.placeholder;
          restoredPerEntry.set(trackingKey, (restoredPerEntry.get(trackingKey) || 0) + 1);
          return item.realValue;
        }
      }

      // Check case-insensitive match
      const lower = cleanMatch.toLowerCase().replace(/\s*@\s*|\s*\[at\]\s*/g, '@');
      if (lowerMap.has(lower)) {
        const item = lowerMap.get(lower);
        fuzzyByPl.set(item.placeholder, (fuzzyByPl.get(item.placeholder) || 0) + 1);
        restoredCount++;
        const trackingKey = item.isAlias ? item.targetPlaceholder : item.placeholder;
        restoredPerEntry.set(trackingKey, (restoredPerEntry.get(trackingKey) || 0) + 1);
        return item.realValue;
      }

      return match;
    });

    for (const [pl, count] of countByPl.entries()) {
      const item = exactMap.get(pl);
      details.push({
        placeholder: pl,
        realValue: item.realValue,
        count,
        matchedFuzzy: false,
        isAlias: item.isAlias
      });
    }

    for (const [pl, count] of fuzzyByPl.entries()) {
      const item = exactMap.get(pl) || lowerMap.get(pl.toLowerCase());
      details.push({
        placeholder: pl,
        realValue: item.realValue,
        count,
        matchedFuzzy: true,
        isAlias: item.isAlias
      });
    }
  } else {
    // NORMAL PATH: Sort by placeholder length DESCENDING
    allReplacementItems.sort((a, b) => b.placeholder.length - a.placeholder.length);

    for (const item of allReplacementItems) {
      const { placeholder, realValue, isAlias, targetPlaceholder } = item;
      if (!placeholder || !realValue) continue;

      let subCount = 0;
      let isFuzzy = false;
      const escaped = escapeRegex(placeholder);

      // A. Tolerant bracket wrappers: [PLACEHOLDER] or <PLACEHOLDER>
      // Note: angle brackets are only stripped for TAG placeholders (e.g. <REDACTED_KEY_1>),
      // preserving standard RFC email angle brackets (<user_A@example.com>).
      if (restoredText.includes('[') || (placeholder.startsWith('REDACTED_') && restoredText.includes('<'))) {
        const bracketPattern = placeholder.startsWith('REDACTED_') ? `\\[${escaped}\\]|<${escaped}>` : `\\[${escaped}\\]`;
        const bracketRegex = new RegExp(bracketPattern, 'g');
        const prevCount = subCount;
        restoredText = restoredText.replace(bracketRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCount) isFuzzy = true;
      }

      // B. Escaped underscores in markdown: REDACTED\_KEY\_1 or user\_A@example.com
      if (placeholder.includes('_') && restoredText.includes('\\_')) {
        const escapedUnderscore = escapeRegex(placeholder.replace(/_/g, '\\_'));
        const escUnderRegex = new RegExp(escapedUnderscore, 'g');
        const prevCount = subCount;
        restoredText = restoredText.replace(escUnderRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCount) isFuzzy = true;
      }

      // C. Exact match
      const exactRegex = new RegExp(escaped, 'g');
      restoredText = restoredText.replace(exactRegex, () => {
        subCount++;
        return realValue;
      });

      // D. Spaces or hyphens instead of underscores (e.g. REDACTED KEY 1)
      if (placeholder.includes('_')) {
        const parts = placeholder.split('_');
        if (parts.length >= 2) {
          const flexSepPattern = `\\b${parts.map(p => escapeRegex(p)).join('[\\s-]')}\\b`;
          const flexSepRegex = new RegExp(flexSepPattern, 'g');
          const prevCount = subCount;
          restoredText = restoredText.replace(flexSepRegex, () => {
            subCount++;
            return realValue;
          });
          if (subCount > prevCount) isFuzzy = true;
        }
      }

      // D. Case-insensitive match (e.g. AI downcased token)
      const caseRegex = new RegExp(escaped, 'gi');
      const prevCountCase = subCount;
      restoredText = restoredText.replace(caseRegex, () => {
        subCount++;
        return realValue;
      });
      if (subCount > prevCountCase) isFuzzy = true;

      // E. Email spacing deformation
      if (placeholder.includes('@example.com')) {
        const emailPrefix = placeholder.split('@')[0];
        const deformEmailRegex = new RegExp(`${escapeRegex(emailPrefix)}\\s*@\\s*example\\.com`, 'gi');
        const prevCountDeform = subCount;
        restoredText = restoredText.replace(deformEmailRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCountDeform) isFuzzy = true;
      }

      // F. Format-valid Aadhaar AI variation tolerance
      if (item.type === 'AADHAAR' || /^9999[\s-]*0000[\s-]*\d{4}$/.test(placeholder)) {
        const d3 = placeholder.replace(/\D/g, '').slice(-4) || '0001';
        const aadhaarFlexRegex = new RegExp(
          `(?<!\\d)9999[\\s-]*0000[\\s-]*${d3}(?!\\d)|(?<!\\d)9999[\\s-]*000[\\s-]*0[\\s-]*00(?!\\d)`,
          'g'
        );
        const prevCountAadhaar = subCount;
        restoredText = restoredText.replace(aadhaarFlexRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCountAadhaar) isFuzzy = true;
      }

      // G. Credit card format tolerance
      if (item.type === 'CREDIT_CARD' || /^4111[\s-]*1111[\s-]*1111[\s-]*\d{4}$/.test(placeholder)) {
        const digits = placeholder.replace(/\D/g, '');
        if (digits.length === 16) {
          const c1 = digits.slice(0, 4);
          const c2 = digits.slice(4, 8);
          const c3 = digits.slice(8, 12);
          const c4 = digits.slice(12, 16);
          const cardFlexRegex = new RegExp(`(?<!\\d)${c1}[\\s-]*${c2}[\\s-]*${c3}[\\s-]*${c4}(?!\\d)`, 'g');
          const prevCountCard = subCount;
          restoredText = restoredText.replace(cardFlexRegex, () => {
            subCount++;
            return realValue;
          });
          if (subCount > prevCountCard) isFuzzy = true;
        }
      }

      // H. Phone format tolerance
      if (item.type === 'US_PHONE' || /^\+1-555-01\d{2}$/.test(placeholder)) {
        const suffix = placeholder.slice(-2);
        const phoneFlexRegex = new RegExp(`(?<!\\d)\\+1[\\s-]*555[\\s-]*01${suffix}(?!\\d)`, 'g');
        const prevCountPhone = subCount;
        restoredText = restoredText.replace(phoneFlexRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCountPhone) isFuzzy = true;
      }

      // I. SSN format tolerance
      if (item.type === 'SSN' || /^000-12-\d{4}$/.test(placeholder)) {
        const suffix = placeholder.slice(-4);
        const ssnFlexRegex = new RegExp(`(?<!\\d)000[\\s-]*12[\\s-]*${suffix}(?!\\d)`, 'g');
        const prevCountSSN = subCount;
        restoredText = restoredText.replace(ssnFlexRegex, () => {
          subCount++;
          return realValue;
        });
        if (subCount > prevCountSSN) isFuzzy = true;
      }

      if (subCount > 0) {
        restoredCount += subCount;
        const trackingKey = isAlias ? targetPlaceholder : placeholder;
        restoredPerEntry.set(trackingKey, (restoredPerEntry.get(trackingKey) || 0) + subCount);
        details.push({
          placeholder,
          realValue,
          count: subCount,
          matchedFuzzy: isFuzzy,
          isAlias
        });
      }
    }
  }

  // 4. Scan for unmatched or lingering placeholders
  const unmatchedList = [];
  const lingeringPatterns = [
    /\bREDACTED_[A-Z0-9_]+\b/gi,
    /\buser_[A-Za-z0-9_]+@example\.com\b/gi,
    /\burluser_\d+\b/gi,
    /\blocaluser_\d+\b/gi,
    /\bhost_[A-Za-z0-9_]+\.example\.internal\b/gi,
    /\bPerson_[A-Za-z0-9_]+\b/g,
    /(?<!\d)4111[\s-]*1111[\s-]*1111[\s-]*\d{4}(?!\d)/g,
    /(?<!\d)000[\s-]*12[\s-]*\d{4}(?!\d)/g,
    /(?<!\d)9999[\s-]*0000[\s-]*\d{4}(?!\d)/g,
    /\bAAAAA\d{4}[A-Z]\b/g
  ];

  const vaultPlaceholders = entries.map(e => e.placeholder);

  for (const pat of lingeringPatterns) {
    let m;
    while ((m = pat.exec(restoredText)) !== null) {
      const found = m[0];
      if (!unmatchedList.some(item => item.token === found)) {
        let closestMatch = null;
        let minDistance = Infinity;
        const candidatePool = vaultPlaceholders.length > 100
          ? vaultPlaceholders.filter(vp => Math.abs(vp.length - found.length) <= 3).slice(0, 30)
          : vaultPlaceholders;

        for (const vp of candidatePool) {
          const dist = levenshteinDistance(found.toLowerCase(), vp.toLowerCase());
          if (dist < minDistance && dist <= 4) {
            minDistance = dist;
            closestMatch = vp;
          }
        }
        unmatchedList.push({
          token: found,
          hint: closestMatch ? `closest vault match: ${closestMatch}?` : null
        });
      }
    }
  }

  // 5. Round-trip Health Check
  const issuedCount = entries.length;
  let foundCount = 0;
  const missing = [];

  for (const e of entries) {
    const hits = restoredPerEntry.get(e.placeholder) || 0;
    if (hits > 0) {
      foundCount++;
    } else {
      missing.push({
        placeholder: e.placeholder,
        category: e.category,
        type: e.type,
        maskedReal: maskRealValue(e.realValue, e.type)
      });
    }
  }

  // Detect unrecognized redaction tokens in the original input text (limit scan on huge texts)
  const rawUnrecognized = text.length > 2000000 ? [] : detectUnrecognizedRedactionTokens(text, vault);
  const unrecognized = rawUnrecognized.filter(u => {
    return !details.some(d => d.placeholder === u.token && d.count > 0);
  });

  const correlationHints = [];
  for (const mis of missing) {
    for (const unrec of unrecognized) {
      if (mis.type === unrec.inferredCategory || mis.category === unrec.inferredCategory ||
          inferCategoryFromToken(mis.placeholder) === unrec.inferredCategory) {
        correlationHints.push({
          missingPlaceholder: mis.placeholder,
          unrecognizedToken: unrec.token,
          message: `Did the AI rewrite ${mis.placeholder} as ${unrec.token}? Map it`
        });
      }
    }
  }

  const isAllClean = (missing.length === 0 && unrecognized.length === 0);
  const healthCheck = {
    issuedCount,
    foundCount,
    restoredCount,
    missingCount: missing.length,
    unrecognizedCount: unrecognized.length,
    missing,
    unrecognized,
    correlationHints,
    status: isAllClean ? 'green' : 'amber'
  };

  return {
    restoredText,
    restoredCount,
    stats: { restoredCount },
    details,
    unmatchedPlaceholders: unmatchedList.map(u => u.token),
    unmatchedDetails: unmatchedList,
    healthCheck
  };
}
