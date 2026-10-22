/**
 * Statement2Ledger - Parser Plugin Types
 */

import { ManualColumnMapping, ParseOptions, StatementMetadata, Transaction, UnparsedLine } from '../types';

export interface DetectionResult {
  confidence: number; // 0.0 to 1.0
  bankName: string;
}

export interface ParsedBankData {
  transactions: Transaction[];
  unparsedLines: UnparsedLine[];
  metadata: StatementMetadata;
}

export interface StatementParser {
  id: string;
  name: string;
  detect(sampleText: string, metadata?: { filename?: string; mimeType?: string }): DetectionResult;
  extractMetadata(sampleText: string, rawRows?: string[][]): StatementMetadata;
  parse(
    data: {
      rawText?: string;
      rows?: string[][];
      clusters?: any[];
    },
    meta: StatementMetadata,
    options: ParseOptions
  ): Promise<ParsedBankData>;
}
