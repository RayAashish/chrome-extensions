import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { sanitizeForCSV } from '../src/core/csv-parser';
import { generateLedgerCSV } from '../src/export/csv';
import { generateLedgerXLSX } from '../src/export/xlsx';
import { ParseResult, Transaction } from '../src/types';

describe('Export Modules Integrity & CSV Injection Protection', () => {
  it('sanitizes formula injection triggers (=, +, -, @, tab)', () => {
    expect(sanitizeForCSV('=1+1')).toBe("'=1+1");
    expect(sanitizeForCSV('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeForCSV('-500')).toBe("'-500");
    expect(sanitizeForCSV('@SUM(1,2)')).toBe("'@SUM(1,2)");
    expect(sanitizeForCSV('\tmalicious')).toBe("'\tmalicious");

    // Standard strings are untouched
    expect(sanitizeForCSV('Swiggy Order')).toBe('Swiggy Order');
    expect(sanitizeForCSV('450.00')).toBe('450.00');
  });

  it('generates CSV with UTF-8 BOM', async () => {
    const tx: Transaction = {
      id: 'tx-1',
      date: '2026-10-15',
      description: 'Swiggy',
      rawNarration: 'UPI-SWIGGY-BENGALURU',
      mode: 'UPI',
      vendor: 'Swiggy',
      reference: '982347923',
      debitPaise: 45000,
      creditPaise: 0,
      signedAmountPaise: -45000,
      balancePaise: 23455000,
      category: 'Food & Dining',
      subcategory: 'Food Delivery',
      tags: ['UPI', 'Swiggy'],
      sourceFile: 'sample.pdf',
      confidence: 0.95,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'verified'
    };

    const csvBlob = generateLedgerCSV([tx]);
    const buffer = await csvBlob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // UTF-8 BOM is 0xEF, 0xBB, 0xBF
    expect(uint8[0]).toBe(0xef);
    expect(uint8[1]).toBe(0xbb);
    expect(uint8[2]).toBe(0xbf);
  });

  it('generates XLSX workbook containing all required sheets and valid structure', async () => {
    const tx: Transaction = {
      id: 'tx-1',
      date: '2026-10-15',
      description: 'Swiggy',
      rawNarration: 'UPI-SWIGGY-BENGALURU',
      mode: 'UPI',
      vendor: 'Swiggy',
      reference: '982347923',
      debitPaise: 45000,
      creditPaise: 0,
      signedAmountPaise: -45000,
      balancePaise: 23455000,
      category: 'Food & Dining',
      subcategory: 'Food Delivery',
      tags: ['UPI', 'Swiggy'],
      sourceFile: 'sample.pdf',
      confidence: 0.95,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'verified'
    };

    const parseResult: ParseResult = {
      transactions: [tx],
      unparsedLines: [],
      metadata: {
        bankName: 'HDFC Bank',
        accountNumberMasked: 'XXXX1234',
        currency: 'INR',
        sourceFormat: 'PDF',
        openingBalancePaise: 5000000,
        closingBalancePaise: 23455000
      },
      reconciliation: {
        totalRows: 1,
        verifiedRows: 1,
        failingRows: 0,
        unverifiedRows: 0,
        isFullyReconciled: true,
        openingBalancePaise: 5000000,
        closingBalancePaise: 23455000,
        calculatedClosingBalancePaise: 23455000,
        totalDebitsPaise: 45000,
        totalCreditsPaise: 0,
        netDifferencePaise: -45000,
        firstBreakingRowIndex: null,
        unparsedLinesCount: 0,
        totalCandidateLines: 1
      }
    };

    const xlsxBlob = generateLedgerXLSX(parseResult, true);
    const arrayBuffer = await xlsxBlob.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    // Assert all 7 sheets are present
    expect(wb.SheetNames).toContain('Transactions');
    expect(wb.SheetNames).toContain('Summary by Category');
    expect(wb.SheetNames).toContain('Monthly Summary');
    expect(wb.SheetNames).toContain('Top Vendors');
    expect(wb.SheetNames).toContain('Reconciliation');
    expect(wb.SheetNames).toContain('Unparsed Lines');
    expect(wb.SheetNames).toContain('Read Me');

    // Assert Transactions sheet has rows
    const ws = wb.Sheets['Transactions'];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data[0][0]).toBe('Date');
    expect(data[1][0]).toBe('2026-10-15');
  });
});
