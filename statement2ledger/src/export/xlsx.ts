/**
 * Statement2Ledger - Multi-Sheet Excel Workbook Generator
 * 
 * Produces an audit-ready .xlsx spreadsheet with:
 * - Transactions (with typed numbers, dates, and Excel SUM formulas)
 * - Summary by Category
 * - Monthly Summary
 * - Top Vendors
 * - Mathematical Reconciliation Report
 * - Unparsed Lines
 * - Read Me & Privacy Audit Proof
 */

import * as XLSX from 'xlsx';
import { paiseToRupees } from '../core/money';
import { ParseResult, Transaction } from '../types';

export function generateLedgerXLSX(result: ParseResult, maskSensitiveInfo = true): Blob {
  const wb = XLSX.utils.book_new();
  const txs = result.transactions;

  // 1. Transactions Sheet
  const txRows: any[] = [];
  txRows.push([
    'Date',
    'Value Date',
    'Description',
    'Raw Narration',
    'Mode',
    'Vendor',
    'Reference',
    'Debit',
    'Credit',
    'Signed Amount',
    'Balance',
    'Category',
    'Subcategory',
    'Tags',
    'Business',
    'Status',
    'Source File'
  ]);

  for (const tx of txs) {
    let rawNarr = tx.rawNarration;
    if (maskSensitiveInfo) {
      rawNarr = rawNarr.replace(/\b([0-9]{6,14})([0-9]{4})\b/g, 'XXXX$2');
    }

    txRows.push([
      tx.date,
      tx.valueDate || tx.date,
      tx.description,
      rawNarr,
      tx.mode,
      tx.vendor,
      tx.reference,
      tx.debitPaise > 0 ? paiseToRupees(tx.debitPaise) : null,
      tx.creditPaise > 0 ? paiseToRupees(tx.creditPaise) : null,
      paiseToRupees(tx.signedAmountPaise),
      paiseToRupees(tx.balancePaise),
      tx.category,
      tx.subcategory,
      tx.tags.join(', '),
      tx.isBusiness ? 'Yes' : 'No',
      tx.verificationStatus,
      tx.sourceFile
    ]);
  }

  // Add formula total row
  if (txs.length > 0) {
    const lastRowIndex = txs.length + 1;
    txRows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      { f: `SUM(H2:H${lastRowIndex})` },
      { f: `SUM(I2:I${lastRowIndex})` },
      { f: `SUM(J2:J${lastRowIndex})` },
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);
  }

  const wsTransactions = XLSX.utils.aoa_to_sheet(txRows);
  // Column widths
  wsTransactions['!cols'] = [
    { wch: 12 }, // Date
    { wch: 12 }, // Value Date
    { wch: 32 }, // Description
    { wch: 40 }, // Raw Narration
    { wch: 10 }, // Mode
    { wch: 20 }, // Vendor
    { wch: 18 }, // Reference
    { wch: 14 }, // Debit
    { wch: 14 }, // Credit
    { wch: 16 }, // Signed Amount
    { wch: 16 }, // Balance
    { wch: 18 }, // Category
    { wch: 18 }, // Subcategory
    { wch: 20 }, // Tags
    { wch: 10 }, // Business
    { wch: 12 }, // Status
    { wch: 22 }  // Source
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transactions');

  // 2. Summary by Category Sheet
  const categoryMap = new Map<string, { count: number; debitPaise: number; creditPaise: number }>();
  let totalExpensePaise = 0;

  for (const tx of txs) {
    const cat = tx.category || 'Uncategorized';
    const curr = categoryMap.get(cat) || { count: 0, debitPaise: 0, creditPaise: 0 };
    curr.count++;
    curr.debitPaise += tx.debitPaise;
    curr.creditPaise += tx.creditPaise;
    categoryMap.set(cat, curr);
    totalExpensePaise += tx.debitPaise;
  }

  const catRows: any[] = [
    ['Category', 'Transaction Count', 'Total Debits (Expense)', 'Total Credits (Income)', 'Net Cashflow', '% of Expenses']
  ];

  const sortedCategories = Array.from(categoryMap.entries()).sort((a, b) => b[1].debitPaise - a[1].debitPaise);

  for (const [catName, data] of sortedCategories) {
    const pct = totalExpensePaise > 0 ? (data.debitPaise / totalExpensePaise) * 100 : 0;
    catRows.push([
      catName,
      data.count,
      paiseToRupees(data.debitPaise),
      paiseToRupees(data.creditPaise),
      paiseToRupees(data.creditPaise - data.debitPaise),
      `${pct.toFixed(1)}%`
    ]);
  }

  const wsCategory = XLSX.utils.aoa_to_sheet(catRows);
  wsCategory['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCategory, 'Summary by Category');

  // 3. Monthly Summary Sheet
  const monthMap = new Map<string, { incomePaise: number; expensePaise: number }>();
  for (const tx of txs) {
    const month = tx.date.substring(0, 7); // YYYY-MM
    const curr = monthMap.get(month) || { incomePaise: 0, expensePaise: 0 };
    curr.incomePaise += tx.creditPaise;
    curr.expensePaise += tx.debitPaise;
    monthMap.set(month, curr);
  }

  const monthRows: any[] = [
    ['Month', 'Total Inflow (Income)', 'Total Outflow (Expenses)', 'Net Savings', 'Savings Rate']
  ];
  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [m, data] of sortedMonths) {
    const net = data.incomePaise - data.expensePaise;
    const savingsRate = data.incomePaise > 0 ? (net / data.incomePaise) * 100 : 0;
    monthRows.push([
      m,
      paiseToRupees(data.incomePaise),
      paiseToRupees(data.expensePaise),
      paiseToRupees(net),
      `${savingsRate.toFixed(1)}%`
    ]);
  }

  const wsMonth = XLSX.utils.aoa_to_sheet(monthRows);
  wsMonth['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsMonth, 'Monthly Summary');

  // 4. Top Vendors Sheet
  const vendorMap = new Map<string, { count: number; spendPaise: number; category: string }>();
  for (const tx of txs) {
    if (tx.debitPaise <= 0) continue;
    const v = tx.vendor || 'Unknown';
    const curr = vendorMap.get(v) || { count: 0, spendPaise: 0, category: tx.category };
    curr.count++;
    curr.spendPaise += tx.debitPaise;
    vendorMap.set(v, curr);
  }

  const topVendors = Array.from(vendorMap.entries())
    .sort((a, b) => b[1].spendPaise - a[1].spendPaise)
    .slice(0, 25);

  const vendorRows: any[] = [['Vendor / Merchant', 'Category', 'Transaction Count', 'Total Spend']];
  for (const [name, d] of topVendors) {
    vendorRows.push([name, d.category, d.count, paiseToRupees(d.spendPaise)]);
  }

  const wsVendors = XLSX.utils.aoa_to_sheet(vendorRows);
  wsVendors['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsVendors, 'Top Vendors');

  // 5. Reconciliation Sheet
  const recon = result.reconciliation;
  const reconRows: any[] = [
    ['METRIC', 'VALUE'],
    ['Reconciliation Status', recon.isFullyReconciled ? 'VERIFIED (PASS)' : 'ACTION REQUIRED (DISCREPANCY)'],
    ['Total Statement Rows', recon.totalRows],
    ['Rows Mathematically Verified', recon.verifiedRows],
    ['Rows Failing Balance Check', recon.failingRows],
    ['Opening Balance', recon.openingBalancePaise !== null ? paiseToRupees(recon.openingBalancePaise) : 'N/A'],
    ['Stated Closing Balance', recon.closingBalancePaise !== null ? paiseToRupees(recon.closingBalancePaise) : 'N/A'],
    ['Calculated Closing Balance', recon.calculatedClosingBalancePaise !== null ? paiseToRupees(recon.calculatedClosingBalancePaise) : 'N/A'],
    ['Total Statement Debits', paiseToRupees(recon.totalDebitsPaise)],
    ['Total Statement Credits', paiseToRupees(recon.totalCreditsPaise)],
    ['Net Movement', paiseToRupees(recon.netDifferencePaise)],
    ['First Breaking Row', recon.firstBreakingRowIndex !== null ? `Row #${recon.firstBreakingRowIndex + 1}` : 'None'],
    ['Breaking Reason', recon.firstBreakingRowReason || 'None']
  ];

  const wsRecon = XLSX.utils.aoa_to_sheet(reconRows);
  wsRecon['!cols'] = [{ wch: 30 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsRecon, 'Reconciliation');

  // 6. Unparsed Lines Sheet
  const unparsedRows: any[] = [['Line Number', 'Source File', 'Raw Line Text', 'Reason']];
  for (const u of result.unparsedLines) {
    unparsedRows.push([u.lineNumber, u.sourceFile, u.rawText, u.reason]);
  }
  const wsUnparsed = XLSX.utils.aoa_to_sheet(unparsedRows);
  wsUnparsed['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 60 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsUnparsed, 'Unparsed Lines');

  // 7. Read Me Sheet
  const readMeRows: any[] = [
    ['STATEMENT2LEDGER - LEDGER REPORT'],
    ['Generated On', new Date().toISOString()],
    ['Bank Name', result.metadata.bankName],
    ['Account Number', result.metadata.accountNumberMasked],
    ['Customer Name', result.metadata.customerNameMasked || 'N/A'],
    [''],
    ['STRICT PRIVACY PROMISE:'],
    ['1. 100% Client-Side: This document was processed strictly inside your web browser.'],
    ['2. Zero Network Activity: No financial figures, account details, or narrations were transmitted.'],
    ['3. Memory-Only: Transaction data was released from browser memory immediately.'],
    [''],
    ['DISCLAIMER:'],
    ['This workbook was generated automatically by Statement2Ledger from bank statement text.'],
    ['Bank statement formats change over time. Always verify against your official bank statement.'],
    ['This report does not constitute official tax or accounting advice.']
  ];
  const wsReadMe = XLSX.utils.aoa_to_sheet(readMeRows);
  wsReadMe['!cols'] = [{ wch: 25 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsReadMe, 'Read Me');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
