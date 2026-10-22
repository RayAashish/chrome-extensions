/**
 * Statement2Ledger - Integer Paise Arithmetic & Indian Amount Parsing
 * 
 * CRITICAL FINANCIAL SAFETY RULE:
 * Never use floating-point numbers for money arithmetic.
 * All internal amounts are stored as integer paise (1 Rupee = 100 Paise).
 */

export interface ParsedAmount {
  paise: number;
  isDebit: boolean;
  isCredit: boolean;
  rawParsed: number; // In rupees as a check
}

/**
 * Parses Indian formatted strings like "1,23,456.78", "Rs. 450.00 Dr", "₹ 1,500.00 Cr",
 * "(1,200.50)", "-500.00" into integer paise and debit/credit indicator.
 */
export function parseIndianAmountToPaise(input: string | number | null | undefined): ParsedAmount {
  if (input === null || input === undefined) {
    return { paise: 0, isDebit: false, isCredit: false, rawParsed: 0 };
  }

  if (typeof input === 'number') {
    if (isNaN(input)) {
      return { paise: 0, isDebit: false, isCredit: false, rawParsed: 0 };
    }
    const isNegative = input < 0;
    const absPaise = Math.round(Math.abs(input) * 100);
    return {
      paise: absPaise,
      isDebit: isNegative,
      isCredit: !isNegative && absPaise > 0,
      rawParsed: input
    };
  }

  let str = String(input).trim();
  if (!str || str === '-' || str === '--') {
    return { paise: 0, isDebit: false, isCredit: false, rawParsed: 0 };
  }

  // Detect Dr/Cr markers (case-insensitive)
  const isExplicitDr = /\b(DR|DEBIT)\b/i.test(str);
  const isExplicitCr = /\b(CR|CREDIT)\b/i.test(str);
  const hasParentheses = /^\(.*\)$/.test(str);
  const hasTrailingMinus = /-$/.test(str);
  const hasLeadingMinus = /^-/.test(str);

  const isDebit = isExplicitDr || hasParentheses || hasTrailingMinus || hasLeadingMinus;
  const isCredit = isExplicitCr && !isDebit;

  // Clean the string: remove currency symbols (₹, Rs, Rs., INR), Dr/Cr tags, letters, commas, spaces, parens
  // Keep only digits and decimal dot
  str = str.replace(/(?:₹|Rs\.?|INR)/gi, '');
  str = str.replace(/[()\-]|(\b(DR|CR|DEBIT|CREDIT)\b)/gi, '');
  str = str.replace(/\s+/g, '');
  str = str.replace(/,/g, '');

  if (!str) {
    return { paise: 0, isDebit: false, isCredit: false, rawParsed: 0 };
  }

  // Split into whole rupees and fractional paise to avoid float errors
  const parts = str.split('.');
  const wholePart = parts[0] || '0';
  let fractionPart = parts[1] || '00';

  // Normalize fraction to exactly 2 digits
  if (fractionPart.length === 1) {
    fractionPart = fractionPart + '0';
  } else if (fractionPart.length > 2) {
    fractionPart = fractionPart.substring(0, 2);
  }

  const wholeRupees = parseInt(wholePart, 10) || 0;
  const fractionPaise = parseInt(fractionPart, 10) || 0;
  const totalPaise = Math.abs(wholeRupees * 100 + fractionPaise);

  return {
    paise: totalPaise,
    isDebit: isDebit,
    isCredit: isCredit || (!isDebit && totalPaise > 0),
    rawParsed: isDebit ? -totalPaise / 100 : totalPaise / 100
  };
}

/**
 * Converts integer paise into rupees float (for calculations where numbers are required).
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Converts integer paise into plain decimal string with exactly two decimal places, e.g. "1234.50".
 * Ideal for CSV and JSON exports (no thousands separators).
 */
export function paiseToPlainDecimal(paise: number, signed = false): string {
  const sign = signed && paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const fractionStr = fraction < 10 ? `0${fraction}` : `${fraction}`;
  return `${sign}${whole}.${fractionStr}`;
}

/**
 * Formats integer paise into Indian numbering standard, e.g. "1,23,456.78" or "₹ 1,23,456.78".
 * Follows the Indian grouping (first 3 digits, then groups of 2 digits).
 */
export function formatPaiseToIndianCurrency(paise: number, includeSymbol = false): string {
  const isNegative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100).toString();
  const fraction = abs % 100;
  const fractionStr = fraction < 10 ? `0${fraction}` : `${fraction}`;

  let formattedWhole = '';
  if (whole.length <= 3) {
    formattedWhole = whole;
  } else {
    const lastThree = whole.substring(whole.length - 3);
    const otherNumbers = whole.substring(0, whole.length - 3);
    // Group remaining into pairs of 2 digits from right to left
    const paired = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedWhole = `${paired},${lastThree}`;
  }

  const sign = isNegative ? '-' : '';
  const symbol = includeSymbol ? '₹ ' : '';
  return `${sign}${symbol}${formattedWhole}.${fractionStr}`;
}
