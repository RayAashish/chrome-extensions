/**
 * Statement2Ledger - CSV Exporter
 * Generates RFC 4180 compliant CSV with UTF-8 BOM, plain decimal amounts,
 * and formula injection sanitization.
 */

import { formatCSVRow } from '../core/csv-parser';
import { paiseToPlainDecimal } from '../core/money';
import { Transaction } from '../types';

export interface CsvExportOptions {
  maskSensitiveInfo?: boolean;
}

export function generateLedgerCSV(transactions: Transaction[], options: CsvExportOptions = {}): Blob {
  const headers = [
    'Date',
    'Value Date',
    'Description',
    'Raw Narration',
    'Mode',
    'Vendor',
    'Reference',
    'Debit (INR)',
    'Credit (INR)',
    'Signed Amount (INR)',
    'Balance (INR)',
    'Category',
    'Subcategory',
    'Tags',
    'Is Business',
    'Verification Status',
    'Confidence',
    'Source File'
  ];

  const rows: string[] = [];
  rows.push(formatCSVRow(headers));

  for (const tx of transactions) {
    let rawNarr = tx.rawNarration;
    if (options.maskSensitiveInfo) {
      // Mask 10-18 digit numbers to last 4 digits
      rawNarr = rawNarr.replace(/\b([0-9]{6,14})([0-9]{4})\b/g, 'XXXX$2');
    }

    const row = [
      tx.date,
      tx.valueDate || tx.date,
      tx.description,
      rawNarr,
      tx.mode,
      tx.vendor,
      tx.reference,
      tx.debitPaise > 0 ? paiseToPlainDecimal(tx.debitPaise) : '',
      tx.creditPaise > 0 ? paiseToPlainDecimal(tx.creditPaise) : '',
      paiseToPlainDecimal(tx.signedAmountPaise, true),
      paiseToPlainDecimal(tx.balancePaise),
      tx.category,
      tx.subcategory,
      tx.tags.join('; '),
      tx.isBusiness ? 'Yes' : 'No',
      tx.verificationStatus,
      (tx.confidence * 100).toFixed(0) + '%',
      tx.sourceFile
    ];

    rows.push(formatCSVRow(row));
  }

  // Prepend UTF-8 BOM (\uFEFF) so Excel opens Hindi / Indian characters without encoding glitches
  const csvContent = '\uFEFF' + rows.join('\r\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}
