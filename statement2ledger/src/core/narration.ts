/**
 * Statement2Ledger - Narration Intelligence & Tokenizer
 * 
 * Parses messy, unstructured Indian bank narration strings into structured fields:
 * - Payment Mode (UPI, NEFT, RTGS, IMPS, ACH, CHEQUE, POS, ATM, NETBANKING, TDS, INTEREST, CHARGES, SALARY, REFUND)
 * - Counterparty / Vendor (normalized via alias dictionary)
 * - Reference ID (RRN, UTR, Cheque No, Transaction ID)
 * - Bank / IFSC / UPI handle (where present)
 * - Cleaned human-friendly description
 */

import { PaymentMode } from '../types';
import { defaultVendorRegistry } from './vendors';

export interface ParsedNarration {
  mode: PaymentMode;
  vendor: string;
  reference: string;
  cleanedDescription: string;
  vpa?: string;
  ifsc?: string;
}

// Indian IFSC pattern: 4 uppercase letters, zero, 6 alphanumeric
const IFSC_REGEX = /\b([A-Z]{4}0[A-Z0-9]{6})\b/i;

// UPI VPA pattern: e.g. user@okhdfcbank, swiggy@icici, 9876543210@paytm
const VPA_REGEX = /([a-zA-Z0-9.\-_]{2,})@([a-zA-Z0-9.\-_]{2,})/;

// Common noise words in Indian bank statements to strip from merchant names:
const NOISE_WORDS = new Set([
  'PAYMENT',
  'FROM',
  'PHONE',
  'MOBILE',
  'APP',
  'TRANS',
  'TRANSACTION',
  'TRANSFER',
  'TRF',
  'TO',
  'BY',
  'VIA',
  'FOR',
  'SALARY',
  'SAL',
  'OCT',
  'NOV',
  'DEC',
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'BANGALORE',
  'BENGALURU',
  'MUMBAI',
  'DELHI',
  'NEW',
  'CHENNAI',
  'HYDERABAD',
  'PUNE',
  'KOLKATA',
  'NOIDA',
  'GURGAON',
  'GURUGRAM',
  'INDIA',
  'IN',
  'PVT',
  'LTD',
  'LIMITED',
  'PRIVATE',
  'SERVICES',
  'SERVICE',
  'RETAIL',
  'ONLINE',
  'STORE',
  'PAY',
  'BILL',
  'PURCHASE',
  'SWIPE',
  'ECOM',
  'WDL',
  'ATM',
  'CASH',
  'INT.PD',
  'INT',
  'PD',
  'INTEREST',
  'SB',
  'CHG',
  'CHARGES',
  'FEE',
  'GST'
]);

/**
 * Main narration parsing function.
 */
export function parseNarration(rawNarration: string): ParsedNarration {
  if (!rawNarration || !rawNarration.trim()) {
    return {
      mode: 'OTHER',
      vendor: 'Unknown',
      reference: '',
      cleanedDescription: 'Transaction'
    };
  }

  const raw = rawNarration.trim();
  const upper = raw.toUpperCase();

  // 1. Detect Mode
  const mode = detectPaymentMode(upper);

  // 2. Extract IFSC if present
  const ifscMatch = upper.match(IFSC_REGEX);
  const ifsc = ifscMatch ? ifscMatch[1].toUpperCase() : undefined;

  // 3. Extract VPA if present
  const vpaMatch = raw.match(VPA_REGEX);
  const vpa = vpaMatch ? vpaMatch[0].toLowerCase() : undefined;

  // 4. Extract Reference ID (12-digit RRN, 9-digit RRN, Cheque number, UTR)
  const reference = extractReference(upper, mode);

  // 5. Extract Candidate Vendor Name
  let candidateVendor = extractVendorCandidate(raw, upper, mode, vpa, ifsc, reference);

  // 6. Match against Vendor Registry (dictionary of aliases)
  let normalizedVendor = '';

  // Mode overrides for bank internal actions
  if (mode === 'TDS') {
    normalizedVendor = 'Income Tax Department';
  } else if (mode === 'INTEREST') {
    normalizedVendor = 'Bank Interest';
  } else if (mode === 'CHARGES') {
    normalizedVendor = 'Bank Charges';
  } else if (mode === 'ATM') {
    normalizedVendor = 'ATM Cash Withdrawal';
  } else {
    // Check direct vendor match
    const vendorMatch = defaultVendorRegistry.matchVendor(vpa || candidateVendor || upper);
    if (vendorMatch) {
      normalizedVendor = vendorMatch.normalized;
    } else if (candidateVendor) {
      normalizedVendor = cleanVendorName(candidateVendor);
    }

    if (!normalizedVendor) {
      normalizedVendor = deriveFallbackVendor(mode, upper);
    }
  }

  // 7. Clean Description
  const cleanedDescription = buildCleanDescription(mode, normalizedVendor, reference, raw);

  return {
    mode,
    vendor: normalizedVendor,
    reference,
    cleanedDescription,
    vpa,
    ifsc
  };
}

/**
 * Detects the transaction payment mode based on markers and acronyms.
 */
function detectPaymentMode(upper: string): PaymentMode {
  // Reversals & Refunds first
  if (/\b(REV|REVERSAL|REFUND)\b/.test(upper)) {
    return 'REFUND';
  }

  // TDS (check before Interest because "TDS ON INTEREST" contains both words)
  if (/\b(TDS|TAX DEDUCT|CHALLAN 280|TAX DEPOSIT)\b/.test(upper)) {
    return 'TDS';
  }

  // Charges (check before POS because "ANNUAL DEBIT CARD AMC/FEE" contains "DEBIT CARD")
  if (/\b(CHG|CHARGES|SMS CHG|ANNUAL FEE|AMC|DEBIT CARD CHARGES|DEBIT CARD AMC|DEBIT CARD MAINTENANCE)\b/.test(upper)) {
    return 'CHARGES';
  }

  // UPI
  if (upper.startsWith('UPI') || /\bUPI\b/.test(upper) || upper.includes('@')) {
    return 'UPI';
  }

  // NEFT
  if (upper.startsWith('NEFT') || /\bNEFT\b/.test(upper)) {
    return 'NEFT';
  }

  // RTGS
  if (upper.startsWith('RTGS') || /\bRTGS\b/.test(upper)) {
    return 'RTGS';
  }

  // IMPS
  if (upper.startsWith('IMPS') || /\bIMPS\b/.test(upper)) {
    return 'IMPS';
  }

  // ACH / NACH / ECS
  if (/\b(ACH|NACH|ECS|CMS)\b/.test(upper)) {
    return 'ACH';
  }

  // Cheque
  if (/\b(CHQ|CHEQUE|CLRNG|CLEARING)\b/.test(upper)) {
    return 'CHEQUE';
  }

  // ATM
  if (/\b(ATM|NFS|CASH WDL|CWDR|CASH WITHDRAWAL)\b/.test(upper)) {
    return 'ATM';
  }

  // POS / Card Swipe
  if (/\b(POS|DEBIT CARD|CARD SWIPE|VISA|MASTERCARD|RUPAY)\b/.test(upper)) {
    return 'POS';
  }

  // Salary
  if (/\b(SALARY|SAL\/|PAYROLL)\b/.test(upper)) {
    return 'SALARY';
  }

  // Interest
  if (/\b(INT\.PD|INTEREST|SB INT|SAVINGS INT|CREDIT INT)\b/.test(upper)) {
    return 'INTEREST';
  }

  // NetBanking / Transfers
  if (/\b(NETBANKING|TPT|FUND TRF|INTERNAL TRF|MB:|IB:|SWEEP)\b/.test(upper)) {
    return 'NETBANKING';
  }

  return 'OTHER';
}

/**
 * Extracts reference identifier (RRN, Cheque number, UTR, or bank tx ID).
 */
function extractReference(upper: string, mode: PaymentMode): string {
  // Cheque Number: 6 digits
  if (mode === 'CHEQUE') {
    const chqMatch = upper.match(/\b(\d{6})\b/);
    if (chqMatch) return chqMatch[1];
  }

  // Card last-4 for POS swipes
  if (mode === 'POS') {
    const cardMatch = upper.match(/[0-9X]{6,14}([0-9]{4})\b/);
    if (cardMatch) return cardMatch[1];
  }

  // Standard 12-digit NPCI RRN (Retrieval Reference Number) used in UPI/IMPS
  const rrn12Match = upper.match(/\b(\d{12})\b/);
  if (rrn12Match) return rrn12Match[1];

  // Specific 9-digit RRN in older or certain bank formats (like Worked Example: 982347923)
  const rrn9Match = upper.match(/\b(\d{9,11})\b/);
  if (rrn9Match) return rrn9Match[1];

  // Alphanumeric UTR for NEFT/RTGS: must contain at least one digit and be 12-22 chars (not pure letters)
  if (mode === 'NEFT' || mode === 'RTGS') {
    const utrMatch = upper.match(/\b(?=.*\d)([A-Z0-9]{12,22})\b/);
    if (utrMatch) return utrMatch[1];
  }

  return '';
}

/**
 * Extracts the candidate vendor string from tokenized narration.
 */
function extractVendorCandidate(
  raw: string,
  upper: string,
  mode: PaymentMode,
  vpa?: string,
  ifsc?: string,
  reference?: string
): string {
  // If VPA exists, check VPA prefix first (e.g. "swiggy" from "swiggy@icici")
  if (vpa) {
    const vpaUser = vpa.split('@')[0];
    if (vpaUser && vpaUser.length > 2 && !/^\d+$/.test(vpaUser)) {
      const vendorFromVpa = defaultVendorRegistry.matchVendor(vpaUser);
      if (vendorFromVpa) return vendorFromVpa.normalized;
    }
  }

  // Split by common Indian banking delimiters: "-", "/", ":", "*", " "
  const tokens = raw
    .split(/[-/:*|\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Filter out mode words, numbers, reference, ifsc, vpa, and generic codes
  const candidateTokens: string[] = [];

  for (const token of tokens) {
    const uToken = token.toUpperCase().trim();
    if (
      uToken === 'UPI' ||
      uToken === 'NEFT' ||
      uToken === 'NEFT CR' ||
      uToken === 'NEFT DR' ||
      uToken === 'RTGS' ||
      uToken === 'IMPS' ||
      uToken === 'POS' ||
      uToken === 'ATM' ||
      uToken === 'ACH' ||
      uToken === 'CR' ||
      uToken === 'DR' ||
      uToken === 'REV' ||
      uToken === reference ||
      uToken === ifsc ||
      (vpa && token.toLowerCase() === vpa) ||
      /^\d+$/.test(token) || // Pure numbers
      /^[X\d]{10,}$/i.test(token) // Masked card/account numbers like 4XXXXXXXXXXX1234
    ) {
      continue;
    }

    // Strip leading mode prefixes like "NEFT CR " or "BY TRANSFER "
    let cleanToken = token.replace(/^(NEFT|RTGS|IMPS|UPI|BY TRANSFER|TRANSFER)\s+(CR|DR)?\s*/i, '').trim();
    if (!cleanToken) continue;

    // First check if token directly matches a known vendor
    const directMatch = defaultVendorRegistry.matchVendor(cleanToken);
    if (directMatch) {
      return directMatch.normalized;
    }

    // Keep token if not noise
    const words = cleanToken.split(/\s+/).filter((w) => !NOISE_WORDS.has(w.toUpperCase()));
    if (words.length > 0) {
      candidateTokens.push(words.join(' '));
    }
  }

  // Return the first informative candidate token
  if (candidateTokens.length > 0) {
    return candidateTokens[0];
  }

  return '';
}

/**
 * Cleans extracted candidate vendor string (strips digits, trailing punctuation, title-cases).
 */
function cleanVendorName(raw: string): string {
  let cleaned = raw
    .replace(/[0-9_#@!$%^&*()+=~`{}[\]:;"'<>,.?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip noise words
  const words = cleaned
    .split(' ')
    .filter((w) => !NOISE_WORDS.has(w.toUpperCase()) && w.length > 1);

  if (words.length === 0) return raw.trim();

  // Title Case
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function deriveFallbackVendor(mode: PaymentMode, upper: string): string {
  switch (mode) {
    case 'INTEREST':
      return 'Bank Interest';
    case 'TDS':
      return 'Income Tax Department';
    case 'CHARGES':
      return 'Bank Charges';
    case 'ATM':
      return 'ATM Cash Withdrawal';
    case 'CHEQUE':
      return 'Cheque Clearing';
    case 'SALARY':
      return 'Employer Salary';
    case 'ACH':
      return 'ECS / NACH Mandate';
    case 'NETBANKING':
      return 'Internal Transfer';
    case 'REFUND':
      return 'Refund / Reversal';
    default:
      return 'General Transfer';
  }
}

function buildCleanDescription(
  mode: PaymentMode,
  vendor: string,
  reference: string,
  raw: string
): string {
  const refSuffix = reference ? ` (Ref: ${reference})` : '';
  if (vendor && vendor !== 'Unknown') {
    return `${mode}: ${vendor}${refSuffix}`;
  }
  return raw.length > 40 ? `${raw.substring(0, 37)}...` : raw;
}
