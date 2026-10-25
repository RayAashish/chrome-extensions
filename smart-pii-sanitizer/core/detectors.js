/**
 * Smart PII Sanitizer - Pluggable Detector Registry (v2.0 Hardened)
 * Pure JavaScript, zero external dependencies, ReDoS-safe with strict boundary lookarounds.
 */

// Shannon entropy in bits per character
export function calculateShannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Luhn algorithm validator for credit cards
export function isValidLuhn(numberString) {
  const digits = numberString.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Verhoeff algorithm validator for Aadhaar numbers
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export function isValidVerhoeff(numStr) {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length !== 12) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

// Generate deterministic Luhn-valid 16-digit test credit card numbers
export function generateDeterministicLuhnCard(index) {
  const seq = (100 + (index % 899)).toString().padStart(3, '0');
  const base15 = `411111111111${seq}`;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = parseInt(base15.charAt(i), 10);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  const full16 = base15 + checkDigit.toString();
  return `${full16.slice(0, 4)}-${full16.slice(4, 8)}-${full16.slice(8, 12)}-${full16.slice(12, 16)}`;
}

// Convert zero-indexed counter to letter sequence: 0->A, 25->Z, 26->AA
export function indexToLetterSequence(index) {
  let result = '';
  let temp = index;
  while (temp >= 0) {
    result = String.fromCharCode(65 + (temp % 26)) + result;
    temp = Math.floor(temp / 26) - 1;
  }
  return result;
}

// List of normalized secret key terms
export const SECRET_KEY_TERMS = new Set([
  'api', 'apikey', 'api_key', 'apis', 'xapikey', 'x_api_key', 'x_auth_token',
  'pass', 'passwd', 'pwd', 'password', 'passphrase', 'pword', 'passcode', 'pin',
  'secret', 'secrets', 'secretkey', 'secret_key', 'client_secret', 'clientsecret',
  'sensitive', 'sensitive_value', 'sensitivevalue',
  'token', 'tokens', 'authtoken', 'auth_token', '_authtoken', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'bearer', 'bearer_token', 'bearertoken', 'id_token', 'idtoken',
  'auth', 'authorization', 'authenticator', 'credential', 'credentials',
  'private_key', 'privatekey', 'priv_key', 'privkey', 'private_key_id', 'privatekeyid',
  'access_key', 'accesskey', 'secret_access_key', 'aws_secret_access_key',
  'accountkey', 'account_key', 'sharedaccesssignature',
  'signature', 'sig',
  'session', 'sessionid', 'session_id', 'session_secret', 'cookie', 'cookies',
  'salt', 'pepper', 'dsn', 'connectionstring', 'connection_string', 'conn_str',
  'db_pass', 'db_password', 'db_passwords', 'database_password', 'dbpass', 'dbpassword',
  'master_key', 'masterkey', 'encryption_key', 'encryptionkey', 'signing_key',
  'webhook', 'webhook_secret', 'webhook_url', 'signing_secret', 'app_secret', 'appsecret'
]);

export function isPlaceholderTemplate(val) {
  if (!val || typeof val !== 'string') return false;
  const v = val.trim();
  if (/^<[a-zA-Z0-9_.-]+>$/.test(v)) return true; // e.g. <password>, <token>
  if (/^(?:YOUR_[A-Z0-9_]+|INSERT_[A-Z0-9_]+|REPLACE_[A-Z0-9_]+|TODO|XXXX+)$/.test(v)) return true;
  if (/^REDACTED_[A-Za-z0-9_]+$/.test(v)) return true;
  return false;
}

export function isValidIBAN(input) {
  if (!input || typeof input !== 'string') return false;
  const clean = input.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numeric += (code - 55).toString();
    } else {
      numeric += rearranged.charAt(i);
    }
  }
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + parseInt(numeric.charAt(i), 10)) % 97;
  }
  return remainder === 1;
}

export function normalizeKeyIdentifier(rawKey) {
  if (!rawKey) return '';
  return rawKey
    .replace(/^["'`$\s]+|["'`\s]+$/g, '')
    .replace(/^(?:export\s+|set\s+|const\s+|let\s+|var\s+|\$env:)/i, '')
    .toLowerCase()
    .replace(/[-_.]+/g, '');
}

export function isSecretKey(rawKey) {
  const norm = normalizeKeyIdentifier(rawKey);
  if (SECRET_KEY_TERMS.has(norm)) return true;

  const tokens = rawKey
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const t of tokens) {
    if (SECRET_KEY_TERMS.has(t)) return true;
  }
  return false;
}

// Known UPI handles (PSPs) in India
export const UPI_HANDLES = new Set([
  'okhdfcbank', 'oksbi', 'okaxis', 'okicici', 'ybl', 'paytm', 'upi',
  'apl', 'ibl', 'axl', 'postbank', 'barodampay', 'airtel', 'federal',
  'kotak', 'indus', 'yesbank', 'allbank', 'aubank', 'unionbank'
]);

export function isValidIPv6(ip) {
  if (!ip || ip.length < 3) return false;
  let clean = ip.replace(/^\[|\]$/g, '').split('%')[0];
  if (clean.includes('/')) clean = clean.split('/')[0];

  const parts = clean.split(':');
  if (parts.length < 3 || parts.length > 8) return false;

  const doubleColonCount = (clean.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  if (doubleColonCount === 0 && parts.length !== 8) return false;

  for (const part of parts) {
    if (part === '') continue;
    if (part.includes('.')) {
      const v4Parts = part.split('.');
      if (v4Parts.length !== 4) return false;
      for (const v4 of v4Parts) {
        const n = parseInt(v4, 10);
        if (isNaN(n) || n < 0 || n > 255) return false;
      }
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return false;
  }
  return true;
}

export const DETECTORS = [
  // 1. UUID Shield (Priority 100 - Shields UUIDs from numeric/phone/secret detectors)
  {
    id: 'uuid_shield',
    name: 'UUID Shield',
    category: 'SYSTEM',
    priority: 100,
    type: 'SHIELD',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'uuid_shield',
          category: 'SYSTEM',
          type: 'SHIELD',
          isShield: true
        });
      }
      return matches;
    }
  },

  // 1b. Base64 Data URI Shield (Priority 100 - Protects inline images from corruption)
  {
    id: 'base64_data_uri_shield',
    name: 'Base64 Data URI Shield',
    category: 'SYSTEM',
    priority: 100,
    type: 'SHIELD',
    scan(text) {
      const matches = [];
      const regex = /data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]{20,}/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'base64_data_uri_shield',
          category: 'SYSTEM',
          type: 'SHIELD',
          isShield: true
        });
      }
      return matches;
    }
  },

  // 1c. Git Commit SHA Shield (Priority 100 - Protects commit references)
  {
    id: 'git_commit_shield',
    name: 'Git Commit SHA Shield',
    category: 'SYSTEM',
    priority: 100,
    type: 'SHIELD',
    scan(text) {
      const matches = [];
      const regex = /(?:\b(?:commit|tree|parent)\s+|\bcommit:\s*)([0-9a-fA-F]{40})\b/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const sha = match[1];
        const start = match.index + match[0].indexOf(sha);
        matches.push({
          start,
          end: start + sha.length,
          rawValue: sha,
          detectorId: 'git_commit_shield',
          category: 'SYSTEM',
          type: 'SHIELD',
          isShield: true
        });
      }
      return matches;
    }
  },

  // 2. PEM Private Key Blocks (Priority 98)
  {
    id: 'pem_private_key',
    name: 'PEM Private Key Block',
    category: 'SECRETS',
    priority: 98,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----(?:[\s\S]*?|(?:\\[rn])+[\s\S]*?)-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'pem_private_key',
          category: 'SECRETS',
          type: 'KEY',
          keepMarkers: true
        });
      }
      return matches;
    }
  },

  // 2b. Webhook URLs (Slack, Discord) (Priority 96)
  {
    id: 'webhook_url',
    name: 'Incoming Webhook URL',
    category: 'SECRETS',
    priority: 96,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /https:\/\/(?:hooks\.slack\.com\/services\/T[0-9A-Z]{8,12}\/B[0-9A-Z]{8,12}\/[0-9a-zA-Z]{24}|discord(?:app)?\.com\/api\/webhooks\/[0-9]{17,21}\/[A-Za-z0-9_-]{60,70})/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'webhook_url',
          category: 'SECRETS',
          type: 'KEY'
        });
      }
      return matches;
    }
  },

  // 3. URLs with userinfo or sensitive query parameters (Priority 95)
  {
    id: 'url_with_credentials',
    name: 'URL with Credentials or Sensitive Params',
    category: 'NETWORK',
    priority: 95,
    type: 'URL',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_.-])((?:https?|ftp|postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|mssql|amqp|jdbc:[a-z0-9_]+):\/\/([^\s"'>]+))(?=[^\s"'>]*)/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const fullUrl = match[1];
        const hasUserinfo = fullUrl.includes('@');
        const hasQuery = fullUrl.includes('?');

        let isSensitive = hasUserinfo;
        if (!isSensitive && hasQuery) {
          const queryString = fullUrl.split('?')[1] || '';
          const params = queryString.split('&');
          for (const p of params) {
            const key = p.split('=')[0].toLowerCase();
            if (isSecretKey(key) || key === 'email') {
              isSensitive = true;
              break;
            }
          }
        }

        if (isSensitive) {
          matches.push({
            start: match.index,
            end: match.index + fullUrl.length,
            rawValue: fullUrl,
            detectorId: 'url_with_credentials',
            category: 'NETWORK',
            type: 'STRUCTURED_URL'
          });
        }
      }
      return matches;
    }
  },

  // 4. CLI Credentials Flags (-u admin:hunter2, --user admin:hunter2)
  {
    id: 'cli_credentials',
    name: 'CLI Credential Flags',
    category: 'SECRETS',
    priority: 92,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /(?:^|\s)(?:-u|--user|--proxy-user)\s+(['"]?)([^:\s"']+):([^'"\s]+)\1/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const user = match[2];
        const pass = match[3];
        const credString = `${user}:${pass}`;
        const credStart = match.index + match[0].indexOf(credString);
        matches.push({
          start: credStart,
          end: credStart + credString.length,
          rawValue: credString,
          detectorId: 'cli_credentials',
          category: 'SECRETS',
          type: 'CLI_USER_PASS',
          user,
          pass
        });
      }
      return matches;
    }
  },

  // 5. Authorization: Basic <base64> and Authorization: Bearer <token>
  {
    id: 'auth_header',
    name: 'HTTP Authorization Header',
    category: 'SECRETS',
    priority: 90,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const basicRegex = /\bAuthorization:\s+Basic\s+([A-Za-z0-9+/=]{8,})/gi;
      let m;
      while ((m = basicRegex.exec(text)) !== null) {
        const token = m[1];
        const start = m.index + m[0].indexOf(token);
        matches.push({
          start,
          end: start + token.length,
          rawValue: token,
          detectorId: 'auth_header',
          category: 'SECRETS',
          type: 'BASIC_AUTH_TOKEN'
        });
      }

      const bearerRegex = /\bAuthorization:\s+Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi;
      while ((m = bearerRegex.exec(text)) !== null) {
        const token = m[1];
        if (token && token.length >= 12) {
          const start = m.index + m[0].indexOf(token);
          matches.push({
            start,
            end: start + token.length,
            rawValue: token,
            detectorId: 'auth_header',
            category: 'SECRETS',
            type: 'BEARER_TOKEN'
          });
        }
      }
      return matches;
    }
  },

  // 6. Vendor API Tokens & Cloud Keys (Priority 88-89)
  {
    id: 'stripe_key',
    name: 'Stripe API Key',
    category: 'SECRETS',
    priority: 89,
    type: 'STRIPE_KEY',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])(?:sk_live|pk_live|sk_test|pk_test|rk_live)_[0-9a-zA-Z]{12,}(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'stripe_key',
          category: 'SECRETS',
          type: 'STRIPE_KEY'
        });
      }
      return matches;
    }
  },
  {
    id: 'aws_key',
    name: 'AWS Access Key ID',
    category: 'SECRETS',
    priority: 88,
    type: 'AWS_KEY',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'aws_key',
          category: 'SECRETS',
          type: 'AWS_KEY'
        });
      }
      return matches;
    }
  },
  {
    id: 'github_token',
    name: 'GitHub Token',
    category: 'SECRETS',
    priority: 88,
    type: 'GITHUB_TOKEN',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,}(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'github_token',
          category: 'SECRETS',
          type: 'GITHUB_TOKEN'
        });
      }
      return matches;
    }
  },
  {
    id: 'slack_token',
    name: 'Slack Token',
    category: 'SECRETS',
    priority: 88,
    type: 'SLACK_TOKEN',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,34}(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'slack_token',
          category: 'SECRETS',
          type: 'SLACK_TOKEN'
        });
      }
      return matches;
    }
  },
  {
    id: 'google_api_key',
    name: 'Google API Key',
    category: 'SECRETS',
    priority: 88,
    type: 'GOOGLE_KEY',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])AIza[0-9A-Za-z_-]{35,36}(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'google_api_key',
          category: 'SECRETS',
          type: 'GOOGLE_KEY'
        });
      }
      return matches;
    }
  },
  {
    id: 'vendor_tokens',
    name: 'Other Provider Tokens & Keys',
    category: 'SECRETS',
    priority: 87,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])(?:whsec_[a-zA-Z0-9]{24,}|SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}|hf_[a-zA-Z0-9]{34,}|npm_[a-zA-Z0-9]{20,}|pypi-[a-zA-Z0-9_-]{40,}|sk-ant-[a-zA-Z0-9_-]{40,}|sk-proj-[a-zA-Z0-9_-]{40,}|sk-[a-zA-Z0-9]{20,}|(?:AC|SK)[0-9a-fA-F]{32}|key-[0-9a-zA-Z]{32}|[0-9]{8,10}:[a-zA-Z0-9_-]{35})(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'vendor_tokens',
          category: 'SECRETS',
          type: 'KEY'
        });
      }
      return matches;
    }
  },

  // 7. JWT Tokens (Priority 86)
  {
    id: 'jwt',
    name: 'JSON Web Token (JWT)',
    category: 'SECRETS',
    priority: 86,
    type: 'JWT',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})(?![A-Za-z0-9_-])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'jwt',
          category: 'SECRETS',
          type: 'JWT'
        });
      }
      return matches;
    }
  },

  // 7b. AWS Account ID in ARN (Priority 85)
  {
    id: 'aws_arn_account',
    name: 'AWS Account ID in ARN',
    category: 'SYSTEM',
    priority: 85,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /\barn:aws:[a-zA-Z0-9-_]+:[a-zA-Z0-9-_]*:([0-9]{12}):[^\s"'>]+\b/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const accountId = match[1];
        const start = match.index + match[0].indexOf(accountId);
        matches.push({
          start,
          end: start + accountId.length,
          rawValue: accountId,
          detectorId: 'aws_arn_account',
          category: 'SYSTEM',
          type: 'KEY'
        });
      }
      return matches;
    }
  },

  // 8. Context-Keyed Secrets (Priority 84 - CASE 1 & CASE 13)
  {
    id: 'context_keyed_secret',
    name: 'Context-Keyed Secret',
    category: 'SECRETS',
    priority: 84,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const lines = text.split('\n');
      let lineStartOffset = 0;

      for (const line of lines) {
        const lineRegex = /^([ \t]*(?:export\s+|set\s+|const\s+|let\s+|var\s+|\$env:|- )?)(["'`]?)([a-zA-Z0-9_.-]+)\2([ \t]*(?:=|:|:=|=>)[ \t]*|[ \t]+)(["'`]?)([\s\S]*?)\5([ \t]*(?:;|,|\r|\n)?)$/;
        const m = line.match(lineRegex);

        if (m) {
          const rawKey = m[3];
          const separator = m[4];
          const quote = m[5];
          const rawVal = m[6];

          if (isSecretKey(rawKey) && rawVal && rawVal.trim().length > 0 && !isPlaceholderTemplate(rawVal)) {
            let val = rawVal;
            if (!quote) {
              const trimmed = val.trim();
              if (
                trimmed.startsWith('{') ||
                trimmed.startsWith('[') ||
                trimmed === 'true' ||
                trimmed === 'false' ||
                trimmed === 'null' ||
                trimmed === ''
              ) {
                lineStartOffset += line.length + 1;
                continue;
              }
              if (val.includes(' #')) {
                val = val.split(' #')[0].trimEnd();
              }
            }

            const prefixPart = m[1] + (m[2] ? m[2] + rawKey + m[2] : rawKey) + separator + quote;
            const start = lineStartOffset + prefixPart.length;
            const end = start + val.length;

            matches.push({
              start,
              end,
              rawValue: val,
              detectorId: 'context_keyed_secret',
              category: 'SECRETS',
              type: 'KEY',
              keyName: rawKey
            });
          }
        }
        lineStartOffset += line.length + 1;
      }

      // JSON inline pairs: "secret_key": "value" or "tokens": ["tok1", "tok2"]
      const jsonSecretRegex = /(["'])([a-zA-Z0-9_.-]+)\1\s*:\s*(?:(["'])([^"'\r\n]+)\3|\[([^\]\r\n]+)\])/g;
      let jm;
      while ((jm = jsonSecretRegex.exec(text)) !== null) {
        const key = jm[2];
        if (isSecretKey(key)) {
          if (jm[4]) {
            const val = jm[4];
            const quoteMark = jm[3];
            const quoteVal = quoteMark + val + quoteMark;
            const idx = jm[0].indexOf(quoteVal);
            const start = jm.index + (idx !== -1 ? idx + quoteMark.length : jm[0].lastIndexOf(val));
            matches.push({
              start,
              end: start + val.length,
              rawValue: val,
              detectorId: 'context_keyed_secret',
              category: 'SECRETS',
              type: 'KEY'
            });
          } else if (jm[5]) {
            const arrayContent = jm[5];
            const elemRegex = /(["'])([^"']+)\1/g;
            let em;
            while ((em = elemRegex.exec(arrayContent)) !== null) {
              const elemVal = em[2];
              const arrayStart = jm.index + jm[0].indexOf(arrayContent);
              const start = arrayStart + em.index + em[0].indexOf(elemVal);
              matches.push({
                start,
                end: start + elemVal.length,
                rawValue: elemVal,
                detectorId: 'context_keyed_secret',
                category: 'SECRETS',
                type: 'KEY'
              });
            }
          }
        }
      }

      // XML/SOAP element scanner: <password>s3cr3t</password>
      const xmlRegex = /<([a-zA-Z0-9_.-]+)>([^<>\r\n]+)<\/\1>/g;
      let xm;
      while ((xm = xmlRegex.exec(text)) !== null) {
        const tag = xm[1];
        const val = xm[2];
        if (isSecretKey(tag) && val.trim().length > 0 && !isPlaceholderTemplate(val)) {
          const start = xm.index + xm[0].indexOf(val);
          matches.push({
            start,
            end: start + val.length,
            rawValue: val,
            detectorId: 'context_keyed_secret',
            category: 'SECRETS',
            type: 'KEY'
          });
        }
      }

      // Inline delimited key=value pairs (e.g. Azure connection strings with ; or logfmt with space)
      const inlineKvRegex = /(?:^|[;\s,])([a-zA-Z0-9_.-]+)=(["']?)([^"'\s;,]+)\2(?=[;\s,]|$)/g;
      let ikm;
      while ((ikm = inlineKvRegex.exec(text)) !== null) {
        const k = ikm[1];
        const v = ikm[3];
        if (isSecretKey(k) && v.trim().length > 0 && !isPlaceholderTemplate(v)) {
          const keyPart = ikm[1] + '=' + ikm[2];
          const start = ikm.index + ikm[0].indexOf(keyPart) + keyPart.length;
          matches.push({
            start,
            end: start + v.length,
            rawValue: v,
            detectorId: 'context_keyed_secret',
            category: 'SECRETS',
            type: 'KEY'
          });
        }
      }

      return matches;
    }
  },

  // 9. Indian Identifiers: GSTIN & PAN (Priority 82)
  {
    id: 'pan',
    name: 'Indian PAN & GSTIN',
    category: 'ID_CARDS',
    priority: 82,
    type: 'PAN',
    scan(text) {
      const matches = [];
      const gstinRegex = /(?<![A-Za-z0-9])([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])(?![A-Za-z0-9])/g;
      let match;
      while ((match = gstinRegex.exec(text)) !== null) {
        const fullGstin = match[1];
        const panPart = fullGstin.slice(2, 12);
        matches.push({
          start: match.index,
          end: match.index + fullGstin.length,
          rawValue: fullGstin,
          detectorId: 'pan',
          category: 'ID_CARDS',
          type: 'GSTIN',
          embeddedPan: panPart
        });
      }

      const panRegex = /(?<![A-Za-z0-9])([A-Z]{5}[0-9]{4}[A-Z])(?![A-Za-z0-9])/g;
      while ((match = panRegex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'pan',
          category: 'ID_CARDS',
          type: 'PAN'
        });
      }
      return matches;
    }
  },

  // 10. Indian Aadhaar Number (Priority 80)
  {
    id: 'aadhaar',
    name: 'Indian Aadhaar Number',
    category: 'ID_CARDS',
    priority: 80,
    type: 'AADHAAR',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])([2-9][0-9]{3}([ -]?)[0-9]{4}\2[0-9]{4})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        const separator = match[2] || '';
        const digitsOnly = raw.replace(/\D/g, '');

        const precedingText = text.slice(Math.max(0, match.index - 50), match.index);
        const hasAadhaarContext = /(?:aadhaar|aadhar|adhar|adhaar)(?:[_\s-]*(?:no|number|num))?|uidai|\buid\b/i.test(precedingText);

        if (hasAadhaarContext || isValidVerhoeff(digitsOnly)) {
          matches.push({
            start: match.index,
            end: match.index + raw.length,
            rawValue: raw,
            detectorId: 'aadhaar',
            category: 'ID_CARDS',
            type: 'AADHAAR',
            separator
          });
        }
      }
      return matches;
    }
  },

  // 11. UPI Virtual Payment Addresses (VPAs) (Priority 78)
  {
    id: 'upi_vpa',
    name: 'UPI Virtual Payment Address',
    category: 'FINANCIAL',
    priority: 78,
    type: 'UPI',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_.-])([a-zA-Z0-9._-]{2,256}@([a-zA-Z0-9]+))(?![A-Za-z0-9_.-])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const fullVpa = match[1];
        const localPart = fullVpa.split('@')[0];
        const psp = match[2].toLowerCase();

        if (UPI_HANDLES.has(psp)) {
          matches.push({
            start: match.index,
            end: match.index + fullVpa.length,
            rawValue: fullVpa,
            detectorId: 'upi_vpa',
            category: 'FINANCIAL',
            type: 'UPI',
            localPart,
            psp
          });
        }
      }
      return matches;
    }
  },

  // 12. Credit Card Numbers (Priority 76 - Luhn Checksum Required)
  {
    id: 'credit_card',
    name: 'Credit Card Number',
    category: 'FINANCIAL',
    priority: 76,
    type: 'CREDIT_CARD',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])((?:\d{4}[- ]){3}\d{4}|\d{13,19})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        const digitsOnly = raw.replace(/\D/g, '');
        if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && isValidLuhn(digitsOnly)) {
          matches.push({
            start: match.index,
            end: match.index + raw.length,
            rawValue: raw,
            detectorId: 'credit_card',
            category: 'FINANCIAL',
            type: 'CREDIT_CARD'
          });
        }
      }
      return matches;
    }
  },

  // 12b. IBAN (Priority 77 - ISO 7064 Mod-97 Checksum)
  {
    id: 'iban',
    name: 'International Bank Account Number (IBAN)',
    category: 'FINANCIAL',
    priority: 77,
    type: 'IBAN',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])([A-Z]{2}[0-9]{2}(?:[ -]?[A-Z0-9]{4}){2,7}[ -]?[A-Z0-9]{1,4})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        if (isValidIBAN(raw)) {
          matches.push({
            start: match.index,
            end: match.index + raw.length,
            rawValue: raw,
            detectorId: 'iban',
            category: 'FINANCIAL',
            type: 'IBAN'
          });
        }
      }
      return matches;
    }
  },

  // 12c. SWIFT / BIC Code (Priority 75)
  {
    id: 'swift_bic',
    name: 'SWIFT / BIC Bank Identifier',
    category: 'FINANCIAL',
    priority: 75,
    type: 'KEY',
    scan(text) {
      const matches = [];
      const regex = /(?:\b(?:swift|bic|swift_code|bic_code)\s*[:=]\s*|\bSWIFT\s+)([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const code = match[1];
        const start = match.index + match[0].indexOf(code);
        matches.push({
          start,
          end: start + code.length,
          rawValue: code,
          detectorId: 'swift_bic',
          category: 'FINANCIAL',
          type: 'KEY'
        });
      }
      return matches;
    }
  },

  // 13. US SSN & ITIN (Priority 74)
  {
    id: 'ssn',
    name: 'US Social Security Number / ITIN',
    category: 'ID_CARDS',
    priority: 74,
    type: 'SSN',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])((?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'ssn',
          category: 'ID_CARDS',
          type: 'SSN'
        });
      }

      // US ITIN (9XX-7X/8X/9X-XXXX)
      const itinRegex = /(?<![A-Za-z0-9])(9\d{2}-(?:[78]\d|9[0-24-9])-\d{4})(?![A-Za-z0-9])/g;
      while ((match = itinRegex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'ssn',
          category: 'ID_CARDS',
          type: 'SSN'
        });
      }

      return matches;
    }
  },

  // 14. Email Addresses (Priority 70 - Includes RFC 6531 / IDN & Unicode Domains & Obfuscated)
  {
    id: 'email',
    name: 'Email Address',
    category: 'EMAIL',
    priority: 70,
    type: 'EMAIL',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9._%+\-–—])((?:[\p{L}\p{M}\p{N}._%+-]|\\u[0-9a-fA-F]{4}|[\u200B-\u200D\u2060\uFEFF])+@[\p{L}\p{M}\p{N}.-]+\.[\p{L}\p{M}]{2,})(?![A-Za-z0-9._%+-])/gu;
      let match;
      while ((match = regex.exec(text)) !== null) {
        let rawEmail = match[1];
        let start = match.index;

        // If preceded by a single backslash that forms an escape like \n, \t, \r
        if (start > 0 && text[start - 1] === '\\') {
          if (/^[ntrbf]/.test(rawEmail) && (start === 1 || text[start - 2] !== '\\')) {
            rawEmail = rawEmail.slice(1);
            start += 1;
          }
        }

        // Trim trailing escape sequences if any
        const trailingEscape = rawEmail.match(/\\(?:[ntrbf]|u[0-9a-fA-F]{4})$/);
        if (trailingEscape) {
          rawEmail = rawEmail.slice(0, -trailingEscape[0].length);
        }

        matches.push({
          start,
          end: start + rawEmail.length,
          rawValue: rawEmail,
          detectorId: 'email',
          category: 'EMAIL',
          type: 'EMAIL'
        });
      }

      // Obfuscated email pattern: user [at] example [dot] com
      const obfRegex = /(?<![A-Za-z0-9])([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})(?![A-Za-z0-9])/g;
      let om;
      while ((om = obfRegex.exec(text)) !== null) {
        matches.push({
          start: om.index,
          end: om.index + om[0].length,
          rawValue: om[0],
          detectorId: 'email',
          category: 'EMAIL',
          type: 'EMAIL'
        });
      }
      return matches;
    }
  },

  // 15. User Home Directory in File Paths (Priority 68 - CASE 5)
  {
    id: 'home_path_username',
    name: 'Home Directory Username in Path',
    category: 'SYSTEM',
    priority: 68,
    type: 'LOCAL_USER',
    scan(text) {
      const matches = [];
      const regex = /(?:(?:\/Users\/|\/home\/|[a-zA-Z]:[\\/]+Users[\\/]+|~))([a-zA-Z0-9_.-]+)(?=[\\/])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const username = match[1];
        if (['Shared', 'Default', 'public', 'all users', 'default user'].includes(username.toLowerCase())) {
          continue;
        }
        const userStart = match.index + match[0].indexOf(username);
        matches.push({
          start: userStart,
          end: userStart + username.length,
          rawValue: username,
          detectorId: 'home_path_username',
          category: 'SYSTEM',
          type: 'LOCAL_USER'
        });
      }
      return matches;
    }
  },

  // 16. Phone Numbers (Priority 65 - India Mobile & International E.164)
  {
    id: 'phone_number',
    name: 'Phone Number',
    category: 'CONTACT',
    priority: 65,
    type: 'PHONE',
    scan(text) {
      const matches = [];

      const indiaRegex = /(?<![A-Za-z0-9])((?:\+91|91|0)?[-. ]?([6-9]\d{4})[-. ]?(\d{5}))(?![A-Za-z0-9])/g;
      let match;
      while ((match = indiaRegex.exec(text)) !== null) {
        const raw = match[1];
        const precedingSlice = text.slice(Math.max(0, match.index - 5), match.index);
        if (/\d{4}-$/.test(precedingSlice)) continue;

        matches.push({
          start: match.index,
          end: match.index + raw.length,
          rawValue: raw,
          detectorId: 'phone_number',
          category: 'CONTACT',
          type: 'INDIA_PHONE'
        });
      }

      const intlRegex = /(?<![A-Za-z0-9])((?:\+[1-9]\d{0,2}[-. ]?(?:\(?\d{1,4}\)?[-. ]?){1,3}\d{3,4}|(?:\+?1[-. ]?)?\(?[2-9]\d{2}\)?[-. ]?[2-9]\d{2}[-. ]?\d{4}|\+1[-. ]?[2-9]\d{2}[-. ]?\d{4}))(?![A-Za-z0-9])/g;
      while ((match = intlRegex.exec(text)) !== null) {
        const raw = match[1];
        const precedingSlice = text.slice(Math.max(0, match.index - 10), match.index);
        if (
          /\d{4}-$/.test(precedingSlice) ||
          /^\d{4}-\d{2}/.test(raw) ||
          /^(?:19|20)\d{2}/.test(raw) ||
          /v(?:er|ersion)?[.\s:=]*$/i.test(precedingSlice) ||
          /order|epoch|timestamp|id\b/i.test(precedingSlice)
        ) {
          continue;
        }

        if (matches.some(m => Math.max(m.start, match.index) < Math.min(m.end, match.index + raw.length))) {
          continue;
        }

        matches.push({
          start: match.index,
          end: match.index + raw.length,
          rawValue: raw,
          detectorId: 'phone_number',
          category: 'CONTACT',
          type: 'US_PHONE'
        });
      }

      return matches;
    }
  },

  // 17. IPv4 Network Addresses (Priority 60)
  {
    id: 'ipv4',
    name: 'IPv4 Network Address',
    category: 'NETWORK',
    priority: 60,
    type: 'IPV4',
    scan(text, options = {}) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_.-])((?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(?![A-Za-z0-9_.-])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const ip = match[1];

        if (options.sensitivity !== 'strict') {
          if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === '255.255.255.255') {
            continue;
          }
        }

        const precedingSlice = text.slice(Math.max(0, match.index - 15), match.index).toLowerCase();
        if (/v(?:er|ersion)?[.\s:=]*$/.test(precedingSlice)) {
          continue;
        }

        matches.push({
          start: match.index,
          end: match.index + ip.length,
          rawValue: ip,
          detectorId: 'ipv4',
          category: 'NETWORK',
          type: 'IPV4'
        });
      }
      return matches;
    }
  },

  // 18. IPv6 Addresses (Priority 58 - Full RFC Validator)
  {
    id: 'ipv6',
    name: 'IPv6 Address',
    category: 'NETWORK',
    priority: 58,
    type: 'IPV6',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_])(?:\[([0-9a-fA-F:.]+)\]|([0-9a-fA-F:]{3,39}))(?![A-Za-z0-9_])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const candidate = match[1] || match[2];
        if (candidate && isValidIPv6(candidate) && candidate !== '::1') {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            rawValue: match[0],
            detectorId: 'ipv6',
            category: 'NETWORK',
            type: 'IPV6'
          });
        }
      }
      return matches;
    }
  },

  // 19. MAC Addresses (Priority 56 - IEEE 802)
  {
    id: 'mac_address',
    name: 'MAC Hardware Address',
    category: 'NETWORK',
    priority: 56,
    type: 'MAC',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9])((?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}|[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})(?![A-Za-z0-9])/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'mac_address',
          category: 'NETWORK',
          type: 'MAC'
        });
      }
      return matches;
    }
  },

  // 20. Internal Domains & Hostnames (Priority 50)
  {
    id: 'internal_domain',
    name: 'Internal Domain/Hostname',
    category: 'NETWORK',
    priority: 50,
    type: 'HOST',
    scan(text) {
      const matches = [];
      const regex = /(?<![A-Za-z0-9_.-])([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.(?:internal|corp|local|lan|priv|intranet|test))(?![A-Za-z0-9_.-])/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          rawValue: match[0],
          detectorId: 'internal_domain',
          category: 'NETWORK',
          type: 'HOST'
        });
      }
      return matches;
    }
  }
];

export function getActiveDetectors(customRules = [], enabledCategoryMap = {}) {
  const defaultList = DETECTORS.filter(d => enabledCategoryMap[d.category] !== false);

  const customList = customRules.map(rule => ({
    id: `custom_${rule.id || Math.random().toString(36).slice(2, 7)}`,
    name: rule.name || 'Custom Rule',
    category: 'CUSTOM',
    priority: rule.priority || 50,
    type: rule.type || 'CUSTOM',
    template: rule.template || 'CUSTOM_TOKEN_{N}',
    scan(text) {
      const matches = [];
      try {
        const regex = new RegExp(rule.regex, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
          const val = match[1] || match[0];
          const start = match[1] ? match.index + match[0].indexOf(match[1]) : match.index;
          matches.push({
            start,
            end: start + val.length,
            rawValue: val,
            detectorId: this.id,
            category: 'CUSTOM',
            type: 'CUSTOM',
            template: this.template
          });
        }
      } catch (err) {
        console.warn(`[Smart PII Sanitizer] Error in custom regex '${rule.name}':`, err);
      }
      return matches;
    }
  }));

  return [...defaultList, ...customList];
}
