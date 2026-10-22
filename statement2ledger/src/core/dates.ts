/**
 * Statement2Ledger - Date Normalization for Indian Bank Statements
 * 
 * Indian banking standard is strictly DAY-FIRST (DD/MM/YYYY or DD-MM-YYYY or DD-MMM-YYYY).
 * Never interpret dates using US month-first format.
 * All functions return ISO 8601 strings (YYYY-MM-DD) or null if invalid.
 */

const MONTH_NAMES: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12'
};

const DAYS_IN_MONTH: Record<number, number> = {
  1: 31,
  2: 28, // Leap year handled dynamically
  3: 31,
  4: 30,
  5: 31,
  6: 30,
  7: 31,
  8: 31,
  9: 30,
  10: 31,
  11: 30,
  12: 31
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Normalizes 2-digit or 4-digit year.
 * Banking convention: 00-69 -> 2000-2069, 70-99 -> 1970-1999.
 */
export function normalizeYear(yearStr: string): string {
  const num = parseInt(yearStr, 10);
  if (yearStr.length === 2) {
    if (num < 70) {
      return (2000 + num).toString();
    } else {
      return (1900 + num).toString();
    }
  }
  return yearStr.padStart(4, '20');
}

/**
 * Attempts to parse an Indian bank statement date string.
 * Supports:
 * - DD/MM/YYYY, DD/MM/YY
 * - DD-MM-YYYY, DD-MM-YY
 * - DD.MM.YYYY, DD.MM.YY
 * - DD-MMM-YYYY, DD-MMM-YY, DD MMM YYYY (e.g. 15-OCT-2023, 15 Oct 26)
 * - YYYY-MM-DD (ISO)
 */
export function parseIndianDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = raw.trim();
  if (str.length < 6 || str.length > 25) return null;

  // 1. Check ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidDate(y, m, d)) {
      return formatDateParts(y, m, d);
    }
  }

  // 2. Check DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (e.g. 15-OCT-2023, 15 Oct 23, 15/Oct/2026)
  const textMonthMatch = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
  if (textMonthMatch) {
    const d = parseInt(textMonthMatch[1], 10);
    const monthKey = textMonthMatch[2].toUpperCase();
    const monthStr = MONTH_NAMES[monthKey];
    if (monthStr) {
      const m = parseInt(monthStr, 10);
      const y = parseInt(normalizeYear(textMonthMatch[3]), 10);
      if (isValidDate(y, m, d)) {
        return formatDateParts(y, m, d);
      }
    }
  }

  // 3. Standard Indian numeric: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (and 2-digit year)
  const numericMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numericMatch) {
    const d = parseInt(numericMatch[1], 10);
    const m = parseInt(numericMatch[2], 10);
    const y = parseInt(normalizeYear(numericMatch[3]), 10);
    if (isValidDate(y, m, d)) {
      return formatDateParts(y, m, d);
    }
  }

  return null;
}

/**
 * Validates whether the given year, month (1-12), and day (1-31) form a valid calendar date.
 */
export function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1970 || year > 2099) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  const maxDays = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month] ?? 31);
  return day <= maxDays;
}

function formatDateParts(year: number, month: number, day: number): string {
  const mStr = month < 10 ? `0${month}` : `${month}`;
  const dStr = day < 10 ? `0${day}` : `${day}`;
  return `${year}-${mStr}-${dStr}`;
}

export interface ExtractedDate {
  raw: string;
  iso: string;
}

/**
 * Searches a cell or string for a valid Indian banking date pattern.
 * Handles dates preceded by serial numbers (e.g. "1 15/10/2023") or whitespace.
 */
export function extractDateFromCell(text: string | null | undefined): ExtractedDate | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length < 6) return null;

  // Direct parse first
  const direct = parseIndianDate(trimmed);
  if (direct) return { raw: trimmed, iso: direct };

  // 1. Alphanumeric month: DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY
  const textMonthMatch = trimmed.match(/\b(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})\b/);
  if (textMonthMatch) {
    const parsed = parseIndianDate(textMonthMatch[0]);
    if (parsed) return { raw: textMonthMatch[0], iso: parsed };
  }

  // 2. Numeric: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const numMatch = trimmed.match(/\b(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})\b/);
  if (numMatch) {
    const parsed = parseIndianDate(numMatch[0]);
    if (parsed) return { raw: numMatch[0], iso: parsed };
  }

  // 3. ISO pattern: YYYY-MM-DD
  const isoMatch = trimmed.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    const parsed = parseIndianDate(isoMatch[0]);
    if (parsed) return { raw: isoMatch[0], iso: parsed };
  }

  return null;
}
