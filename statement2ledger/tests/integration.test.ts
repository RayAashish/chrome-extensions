import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseCSV } from '../src/core/csv-parser';
import { reconcileTransactions } from '../src/core/reconcile';
import { defaultParserRegistry } from '../src/parsers';

describe('Integration Tests - Synthetic Fixtures Processing', () => {
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');

  it('parses synthetic HDFC CSV statement end-to-end and reconciles perfectly', async () => {
    const csvContent = fs.readFileSync(path.join(fixturesDir, 'hdfc_sample.csv'), 'utf-8');
    const rows = parseCSV(csvContent);

    const sampleText = rows.slice(0, 10).map((r) => r.join(' ')).join('\n');
    const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: 'hdfc_sample.csv' });

    expect(parser.id).toBe('hdfc');

    const metadata = parser.extractMetadata(sampleText, rows);
    const result = await parser.parse({ rows }, metadata, { sourceFileName: 'hdfc_sample.csv' });

    expect(result.transactions.length).toBe(8);

    // Verify row 2 is the worked example Swiggy transaction
    const swiggyTx = result.transactions.find((t) => t.vendor === 'Swiggy');
    expect(swiggyTx).toBeDefined();
    expect(swiggyTx?.date).toBe('2026-10-15');
    expect(swiggyTx?.category).toBe('Food & Dining');
    expect(swiggyTx?.debitPaise).toBe(45000);
    expect(swiggyTx?.reference).toBe('982347923');

    // Run balance reconciliation
    const recon = reconcileTransactions(result.transactions, metadata, result.unparsedLines);
    expect(recon.report.isFullyReconciled).toBe(true);
    expect(recon.report.failingRows).toBe(0);
    expect(recon.report.verifiedRows).toBe(8);
  });

  it('parses synthetic SBI CSV statement end-to-end', async () => {
    const csvContent = fs.readFileSync(path.join(fixturesDir, 'sbi_sample.csv'), 'utf-8');
    const rows = parseCSV(csvContent);

    const sampleText = rows.slice(0, 5).map((r) => r.join(' ')).join('\n');
    const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: 'sbi_sample.csv' });

    expect(parser.id).toBe('sbi');

    const metadata = parser.extractMetadata(sampleText, rows);
    const result = await parser.parse({ rows }, metadata, { sourceFileName: 'sbi_sample.csv' });

    expect(result.transactions.length).toBe(3);

    const recon = reconcileTransactions(result.transactions, metadata, result.unparsedLines);
    expect(recon.report.isFullyReconciled).toBe(true);
  });

  it('parses synthetic ICICI CSV statement end-to-end', async () => {
    const csvContent = fs.readFileSync(path.join(fixturesDir, 'icici_sample.csv'), 'utf-8');
    const rows = parseCSV(csvContent);

    const sampleText = rows.slice(0, 5).map((r) => r.join(' ')).join('\n');
    const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: 'icici_sample.csv' });

    expect(parser.id).toBe('icici');

    const metadata = parser.extractMetadata(sampleText, rows);
    const result = await parser.parse({ rows }, metadata, { sourceFileName: 'icici_sample.csv' });

    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0].vendor).toBe('Blinkit');
  });

  it('detects and flags balance corruption in corrupted fixture', async () => {
    const csvContent = fs.readFileSync(path.join(fixturesDir, 'corrupted_balance_sample.csv'), 'utf-8');
    const rows = parseCSV(csvContent);

    const sampleText = rows.slice(0, 5).map((r) => r.join(' ')).join('\n');
    const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: 'corrupted.csv' });
    const metadata = parser.extractMetadata(sampleText, rows);
    const result = await parser.parse({ rows }, metadata, { sourceFileName: 'corrupted.csv' });

    const recon = reconcileTransactions(result.transactions, metadata, result.unparsedLines);
    expect(recon.report.isFullyReconciled).toBe(false);
    expect(recon.report.failingRows).toBeGreaterThanOrEqual(1);
    expect(recon.report.firstBreakingRowIndex).toBe(1); // 2nd row has wrong balance
  });
});
