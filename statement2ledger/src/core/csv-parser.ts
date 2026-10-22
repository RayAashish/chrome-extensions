/**
 * Statement2Ledger - Client-Side CSV/TSV Parser & Injection Sanitizer
 * 
 * Supports:
 * - RFC 4180 parsing with multiline quoted cells and escaped quotes ("")
 * - Automatic delimiter sniffing (comma, semicolon, tab, pipe)
 * - Strip UTF-8 / UTF-16 Byte Order Marks (BOM)
 * - CSV Injection (Formula Injection) protection on export
 */

/**
 * Strips Byte Order Marks (BOM) from string.
 */
export function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1);
  }
  return content;
}

/**
 * Detects the most probable delimiter in a delimited text sample.
 */
export function detectDelimiter(sample: string): string {
  const delimiters = [',', '\t', ';', '|'];
  const lines = sample.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  let bestDelimiter = ',';
  let maxConsistentCount = 0;

  for (const delim of delimiters) {
    const counts = lines.map((line) => (line.match(new RegExp(`\\${delim}`, 'g')) || []).length);
    const firstCount = counts[0];
    if (firstCount > 0 && counts.every((c) => Math.abs(c - firstCount) <= 1)) {
      if (firstCount > maxConsistentCount) {
        maxConsistentCount = firstCount;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

/**
 * Parses CSV/TSV text into an array of string rows.
 * Correctly handles embedded newlines inside quotes, commas within quotes,
 * and double quote escapes ("").
 */
export function parseCSV(rawContent: string, customDelimiter?: string): string[][] {
  const text = stripBOM(rawContent);
  if (!text || !text.trim()) return [];

  const delimiter = customDelimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n in \r\n
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push final field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Sanitizes a field against CSV formula injection (DDE attacks).
 * If a cell begins with '=', '+', '-', '@', or tab, prefix with single quote `'`.
 */
export function sanitizeForCSV(field: string | number | null | undefined): string {
  if (field === null || field === undefined) return '';
  const str = String(field);

  // Formula injection check:
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Encodes a row into an RFC 4180 CSV string with formula injection protection.
 */
export function formatCSVRow(row: (string | number | null | undefined)[]): string {
  return row
    .map((val) => {
      const sanitized = sanitizeForCSV(val);
      if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
        return `"${sanitized.replace(/"/g, '""')}"`;
      }
      return sanitized;
    })
    .join(',');
}
