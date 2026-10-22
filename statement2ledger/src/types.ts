/**
 * Statement2Ledger - Core Type Definitions
 * Strict types for client-side Indian bank statement parsing,
 * normalization, reconciliation, and export.
 */

export type PaymentMode =
  | 'UPI'
  | 'NEFT'
  | 'RTGS'
  | 'IMPS'
  | 'ACH'
  | 'CHEQUE'
  | 'POS'
  | 'ATM'
  | 'NETBANKING'
  | 'INTEREST'
  | 'TDS'
  | 'CHARGES'
  | 'SALARY'
  | 'REFUND'
  | 'OTHER';

export interface Transaction {
  id: string;
  date: string; // ISO 8601 YYYY-MM-DD
  valueDate?: string; // ISO 8601 YYYY-MM-DD
  description: string; // Cleaned description
  rawNarration: string; // Full unadulterated narration
  mode: PaymentMode;
  vendor: string; // Normalized merchant / counterparty
  reference: string; // Cheque / RRN / UTR / Reference ID
  debitPaise: number; // Integer paise (>= 0)
  creditPaise: number; // Integer paise (>= 0)
  signedAmountPaise: number; // +credit or -debit in paise
  balancePaise: number; // Stated running balance in paise
  category: string;
  subcategory: string;
  tags: string[];
  sourceFile: string;
  pageNumber?: number;
  confidence: number; // 0.0 to 1.0
  needsReview: boolean;
  reviewReasons: string[];
  isBusiness?: boolean;
  // Reconciliation fields:
  verificationStatus: 'verified' | 'failed' | 'unverified';
  calculatedBalancePaise?: number;
  balanceDiscrepancyPaise?: number;
}

export interface StatementMetadata {
  bankName: string;
  accountNumberMasked: string; // e.g. "XXXX1234"
  customerNameMasked?: string;
  statementPeriod?: {
    from: string; // ISO YYYY-MM-DD
    to: string; // ISO YYYY-MM-DD
  };
  openingBalancePaise?: number;
  closingBalancePaise?: number;
  totalDebitsPaise?: number;
  totalCreditsPaise?: number;
  totalTransactionsCount?: number;
  currency: string;
  sourceFormat: 'PDF' | 'CSV' | 'XLS' | 'XLSX' | 'TXT';
}

export interface ReconciliationReport {
  totalRows: number;
  verifiedRows: number;
  failingRows: number;
  unverifiedRows: number;
  isFullyReconciled: boolean;
  openingBalancePaise: number | null;
  closingBalancePaise: number | null;
  calculatedClosingBalancePaise: number | null;
  totalDebitsPaise: number;
  totalCreditsPaise: number;
  netDifferencePaise: number;
  firstBreakingRowIndex: number | null;
  firstBreakingRowReason?: string;
  unparsedLinesCount: number;
  totalCandidateLines: number;
}

export interface UnparsedLine {
  id: string;
  sourceFile: string;
  pageNumber?: number;
  lineNumber: number;
  rawText: string;
  reason: string;
}

export interface ParseResult {
  transactions: Transaction[];
  unparsedLines: UnparsedLine[];
  metadata: StatementMetadata;
  reconciliation: ReconciliationReport;
}

export interface ParseOptions {
  sourceFileName: string;
  password?: string;
  onProgress?: (progress: ParseProgress) => void;
  manualMapping?: ManualColumnMapping;
}

export interface ParseProgress {
  stage: 'reading' | 'extracting' | 'parsing' | 'reconciling' | 'completed';
  pageCurrent: number;
  pageTotal: number;
  percentage: number;
  statusMessage: string;
}

export interface ManualColumnMapping {
  dateColIndex: number;
  valueDateColIndex?: number;
  narrationColIndex: number;
  refColIndex?: number;
  // Either split columns:
  debitColIndex?: number;
  creditColIndex?: number;
  // Or single amount column:
  amountColIndex?: number;
  typeColIndex?: number; // Contains Dr/Cr or +/-
  balanceColIndex?: number;
  dateFormat: string; // e.g. "DD/MM/YYYY"
  headerRowIndex: number;
}

export interface VendorEntry {
  normalized: string;
  category: string;
  subcategory: string;
  aliases: string[];
}

export interface CategoryDefinition {
  id: string;
  name: string;
  isExpense: boolean | null;
  icon: string;
  subcategories: string[];
  keywords: string[];
}

export interface UserPreferences {
  vendorRules: Record<string, { category: string; subcategory?: string; isBusiness?: boolean }>;
  customVendors: Record<string, string>;
  savedMappings: Record<string, ManualColumnMapping>;
  maskSensitiveInfo: boolean;
  theme: 'dark' | 'light' | 'system';
  language: 'en' | 'hi';
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PdfRowCluster {
  y: number;
  items: PdfTextItem[];
  fullText: string;
  pageNumber: number;
}

export interface ColumnBounds {
  name: string;
  minX: number;
  maxX: number;
}
