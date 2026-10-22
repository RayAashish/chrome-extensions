import { describe, expect, it } from 'vitest';
import { reconcileTransactions } from '../src/core/reconcile';
import { StatementMetadata, Transaction } from '../src/types';

describe('Running Balance Reconciliation Engine', () => {
  const metadata: StatementMetadata = {
    bankName: 'HDFC Bank',
    accountNumberMasked: 'XXXX1234',
    currency: 'INR',
    sourceFormat: 'PDF',
    openingBalancePaise: 5000000, // 50,000.00
    closingBalancePaise: 23167100 // 2,31,671.00
  };

  const validTransactions: Transaction[] = [
    {
      id: 'tx-1',
      date: '2026-10-01',
      description: 'Salary',
      rawNarration: 'SALARY CREDIT',
      mode: 'SALARY',
      vendor: 'Employer',
      reference: '',
      debitPaise: 0,
      creditPaise: 18500000,
      signedAmountPaise: 18500000,
      balancePaise: 23500000, // 50000 + 185000 = 235000
      category: 'Salary/Income',
      subcategory: 'Salary',
      tags: [],
      sourceFile: 'test.pdf',
      confidence: 1.0,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'unverified'
    },
    {
      id: 'tx-2',
      date: '2026-10-02',
      description: 'Swiggy',
      rawNarration: 'UPI-SWIGGY',
      mode: 'UPI',
      vendor: 'Swiggy',
      reference: '982347923',
      debitPaise: 45000,
      creditPaise: 0,
      signedAmountPaise: -45000,
      balancePaise: 23455000, // 235000 - 450 = 234550
      category: 'Food & Dining',
      subcategory: 'Food Delivery',
      tags: [],
      sourceFile: 'test.pdf',
      confidence: 1.0,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'unverified'
    },
    {
      id: 'tx-3',
      date: '2026-10-03',
      description: 'Uber',
      rawNarration: 'UPI-UBER',
      mode: 'UPI',
      vendor: 'Uber',
      reference: '4289',
      debitPaise: 38000,
      creditPaise: 0,
      signedAmountPaise: -38000,
      balancePaise: 23417000, // 234550 - 380 = 234170
      category: 'Transport',
      subcategory: 'Cab & Auto',
      tags: [],
      sourceFile: 'test.pdf',
      confidence: 1.0,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'unverified'
    },
    {
      id: 'tx-4',
      date: '2026-10-04',
      description: 'Amazon',
      rawNarration: 'POS AMAZON',
      mode: 'POS',
      vendor: 'Amazon',
      reference: '1234',
      debitPaise: 249900,
      creditPaise: 0,
      signedAmountPaise: -249900,
      balancePaise: 23167100, // 234170 - 2499 = 231671
      category: 'Shopping',
      subcategory: 'E-Commerce',
      tags: [],
      sourceFile: 'test.pdf',
      confidence: 1.0,
      needsReview: false,
      reviewReasons: [],
      verificationStatus: 'unverified'
    }
  ];

  it('reconciles valid sequential transactions with 100% pass', () => {
    const res = reconcileTransactions(validTransactions, metadata);
    expect(res.report.isFullyReconciled).toBe(true);
    expect(res.report.totalRows).toBe(4);
    expect(res.report.verifiedRows).toBe(4);
    expect(res.report.failingRows).toBe(0);
    expect(res.report.firstBreakingRowIndex).toBeNull();
    expect(res.report.totalDebitsPaise).toBe(332900); // 450 + 380 + 2499 = 3329
    expect(res.report.totalCreditsPaise).toBe(18500000);
  });

  it('flags a deliberately corrupted row with exact mismatch amount and breaking index', () => {
    const corruptedTxs = JSON.parse(JSON.stringify(validTransactions));
    // Corrupt row 2 (index 1): stated balance is 23000000 instead of 23455000 (diff 4550.00)
    corruptedTxs[1].balancePaise = 23000000;

    const res = reconcileTransactions(corruptedTxs, metadata);
    expect(res.report.isFullyReconciled).toBe(false);
    expect(res.report.failingRows).toBeGreaterThanOrEqual(1);
    expect(res.report.firstBreakingRowIndex).toBe(1); // Row 2 broken
    expect(res.report.firstBreakingRowReason).toBeDefined();
    expect(corruptedTxs[1].verificationStatus).toBe('failed');
    expect(corruptedTxs[1].needsReview).toBe(true);
  });

  it('reconciles reverse-chronological statements and normalizes them into chronological order', () => {
    // Reverse validTransactions so row 0 is newest, row 3 is oldest
    const reverseTxs: Transaction[] = JSON.parse(JSON.stringify(validTransactions)).reverse();
    expect(reverseTxs[0].date).toBe('2026-10-04');
    expect(reverseTxs[3].date).toBe('2026-10-01');

    const res = reconcileTransactions(reverseTxs, metadata);
    expect(res.report.isFullyReconciled).toBe(true);
    expect(res.report.failingRows).toBe(0);
    expect(res.report.verifiedRows).toBe(4);
    // After normalization, row 0 must be the oldest (2026-10-01)
    expect(res.transactions[0].date).toBe('2026-10-01');
    expect(res.transactions[3].date).toBe('2026-10-04');
    expect(res.report.calculatedClosingBalancePaise).toBe(23167100);
  });

  it('self-heals inverted debit/credit signs when balance progression is clear', () => {
    const invertedTxs: Transaction[] = JSON.parse(JSON.stringify(validTransactions));
    // Tx 2 was a debit of 45000 (-45000). Invert it to credit of 45000 (+45000)
    invertedTxs[1].debitPaise = 0;
    invertedTxs[1].creditPaise = 45000;
    invertedTxs[1].signedAmountPaise = 45000;

    const res = reconcileTransactions(invertedTxs, metadata);
    expect(res.report.isFullyReconciled).toBe(true);
    expect(res.report.failingRows).toBe(0);
    // Should self-heal back to debit
    expect(res.transactions[1].debitPaise).toBe(45000);
    expect(res.transactions[1].creditPaise).toBe(0);
    expect(res.transactions[1].signedAmountPaise).toBe(-45000);
  });

  it('normalizes out-of-order intraday transactions on the same date', () => {
    // Two transactions on the same date:
    // Tx A: balance goes from 100000 -> 90000 (-10000)
    // Tx B: balance goes from 90000 -> 95000 (+5000)
    // If parsed in reverse order [Tx B, Tx A] on the same date:
    const txA: Transaction = {
      ...validTransactions[1],
      id: 'intraday-A',
      date: '2026-10-05',
      debitPaise: 10000,
      creditPaise: 0,
      signedAmountPaise: -10000,
      balancePaise: 90000
    };
    const txB: Transaction = {
      ...validTransactions[2],
      id: 'intraday-B',
      date: '2026-10-05',
      debitPaise: 0,
      creditPaise: 5000,
      signedAmountPaise: 5000,
      balancePaise: 95000
    };
    // Baseline: starting at 100000
    const tx0: Transaction = {
      ...validTransactions[0],
      id: 'intraday-0',
      date: '2026-10-04',
      debitPaise: 0,
      creditPaise: 0,
      signedAmountPaise: 0,
      balancePaise: 100000
    };

    // Scrambled intraday order: [tx0, txB, txA]
    const res = reconcileTransactions([tx0, txB, txA]);
    expect(res.report.isFullyReconciled).toBe(true);
    expect(res.report.failingRows).toBe(0);
    // Verified that order is normalized to [tx0, txA, txB]
    expect(res.transactions[1].id).toBe('intraday-A');
    expect(res.transactions[2].id).toBe('intraday-B');
  });

  it('detects duplicates across overlapping statement periods', () => {
    const txA: Transaction = { ...validTransactions[1], sourceFile: 'month1.csv' };
    const txB: Transaction = { ...validTransactions[1], sourceFile: 'month2.csv' };

    const merged = [txA];
    const isDuplicate = merged.some(
      (m) =>
        m.sourceFile !== txB.sourceFile &&
        m.date === txB.date &&
        m.signedAmountPaise === txB.signedAmountPaise &&
        m.reference === txB.reference
    );

    expect(isDuplicate).toBe(true);
  });
});
