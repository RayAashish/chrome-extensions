/**
 * Smart PII Sanitizer - Reverse Map Engine (v2.0 Hardened)
 * Longest-first ordering, typed label support, closest-match hint for unmatched tokens.
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Levenshtein distance for closest-match hints
function levenshteinDistance(s1, s2) {
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

export function reverseMap(text, vault, options = {}) {
  if (typeof text !== 'string' || text.length === 0 || !vault) {
    return {
      restoredText: text || '',
      restoredCount: 0,
      details: [],
      unmatchedPlaceholders: []
    };
  }

  let restoredText = text;
  let restoredCount = 0;
  const details = [];

  // 1. Sort vault entries by placeholder length DESCENDING
  const entries = vault.getAllEntries();
  entries.sort((a, b) => b.placeholder.length - a.placeholder.length);

  // If there are many entries, build an O(1) Map and single-pass token replacer for 100x speed
  if (entries.length > 60) {
    const exactMap = new Map();
    const lowerMap = new Map();
    for (const e of entries) {
      exactMap.set(e.placeholder, e.realValue);
      lowerMap.set(e.placeholder.toLowerCase(), { realValue: e.realValue, original: e.placeholder });
    }

    const placeholderPattern = /(?:REDACTED_[A-Za-z0-9_]+|user_[A-Za-z0-9_]+(?:\s*@\s*|\s*\[at\]\s*|@)example\.com|10\.0\.\d{1,3}\.\d{1,3}|2001:db8::[0-9a-fA-F]+|00:00:5E:00:53:[0-9a-fA-F]{2}|(?:urluser|localuser)_\d+|\+1-555-01\d{2}|50000\d{5}|4111[- ]1111[- ]1111[- ]\d{4}|000-12-\d{4}|9999[ -]?0000[ -]?\d{4}|[A-Z]{5}[0-9]{4}[A-Z]|host_[A-Za-z0-9_.-]+\.example\.internal|GB00TEST[0-9A-Z]{10}|CUSTOM_[A-Za-z0-9_]+)/gi;

    const countByPl = new Map();
    const fuzzyByPl = new Map();

    restoredText = restoredText.replace(placeholderPattern, (match) => {
      if (exactMap.has(match)) {
        const rv = exactMap.get(match);
        countByPl.set(match, (countByPl.get(match) || 0) + 1);
        restoredCount++;
        return rv;
      }
      const lower = match.toLowerCase().replace(/\s*@\s*|\s*\[at\]\s*/g, '@');
      if (lowerMap.has(lower)) {
        const item = lowerMap.get(lower);
        fuzzyByPl.set(item.original, (fuzzyByPl.get(item.original) || 0) + 1);
        restoredCount++;
        return item.realValue;
      }
      return match;
    });

    for (const [pl, count] of countByPl.entries()) {
      details.push({
        placeholder: pl,
        realValue: exactMap.get(pl),
        count,
        matchedFuzzy: false
      });
    }

    for (const [pl, count] of fuzzyByPl.entries()) {
      details.push({
        placeholder: pl,
        realValue: exactMap.get(pl),
        count,
        matchedFuzzy: true
      });
    }
  } else {
    for (const entry of entries) {
      const { placeholder, realValue } = entry;
      if (!placeholder) continue;
      const escaped = escapeRegex(placeholder);

      // Exact match replacement
      const exactRegex = new RegExp(escaped, 'g');
      let matchCount = 0;
      restoredText = restoredText.replace(exactRegex, () => {
        matchCount++;
        return realValue;
      });

      if (matchCount > 0) {
        restoredCount += matchCount;
        details.push({
          placeholder,
          realValue,
          count: matchCount,
          matchedFuzzy: false
        });
        continue;
      }

      // Case-insensitive match (e.g. AI downcased token)
      const caseRegex = new RegExp(escaped, 'gi');
      let fuzzyCount = 0;
      restoredText = restoredText.replace(caseRegex, () => {
        fuzzyCount++;
        return realValue;
      });

      if (fuzzyCount > 0) {
        restoredCount += fuzzyCount;
        details.push({
          placeholder,
          realValue,
          count: fuzzyCount,
          matchedFuzzy: true
        });
        continue;
      }

      // Spacing deformation around email @
      if (placeholder.includes('@example.com')) {
        const emailPrefix = placeholder.split('@')[0];
        const deformEmailRegex = new RegExp(`${escapeRegex(emailPrefix)}\\s*@\\s*example\\.com`, 'gi');
        let deformCount = 0;
        restoredText = restoredText.replace(deformEmailRegex, () => {
          deformCount++;
          return realValue;
        });
        if (deformCount > 0) {
          restoredCount += deformCount;
          details.push({
            placeholder,
            realValue,
            count: deformCount,
            matchedFuzzy: true
          });
        }
      }
    }
  }

  // 2. Scan for unmatched or deformed placeholders lingering in the text
  const unmatchedList = [];
  const lingeringPatterns = [
    /\bREDACTED_[A-Z0-9_]+\b/gi,
    /\buser_[A-Za-z0-9_]+@example\.com\b/gi,
    /\burluser_\d+\b/gi,
    /\blocaluser_\d+\b/gi,
    /\bhost_[A-Za-z0-9_]+\.example\.internal\b/gi,
    /\bPerson_[A-Za-z0-9_]+\b/g,
    /\b(?:4111[- ]1111[- ]1111[- ]\d{4})\b/g,
    /\b000-12-\d{4}\b/g,
    /\b9999[ -]?0000[ -]?\d{4}\b/g,
    /\bAAAAA\d{4}[A-Z]\b/g
  ];

  const vaultPlaceholders = entries.map(e => e.placeholder);

  for (const pat of lingeringPatterns) {
    let m;
    while ((m = pat.exec(restoredText)) !== null) {
      const found = m[0];
      if (!unmatchedList.some(item => item.token === found)) {
        // Find closest vault match hint (limit comparison pool on large vaults to maintain 60 FPS)
        let closestMatch = null;
        let minDistance = Infinity;
        const candidatePool = vaultPlaceholders.length > 100
          ? vaultPlaceholders.filter(vp => Math.abs(vp.length - found.length) <= 3).slice(0, 50)
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

  return {
    restoredText,
    restoredCount,
    stats: { restoredCount },
    details,
    unmatchedPlaceholders: unmatchedList.map(u => u.token),
    unmatchedDetails: unmatchedList
  };
}
