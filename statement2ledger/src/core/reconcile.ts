/**
 * Statement2Ledger - Running Balance Reconciliation Engine
 * 
 * Verifies every transaction row using integer paise arithmetic:
 *   Previous Balance + Credit - Debit == Stated Balance
 * 
 * Automatically detects whether statement rows are printed in chronological
 * (oldest first) or reverse-chronological (newest first) order and normalizes
 * them into chronological order.
 * Provides self-healing sign correction, intraday ordering, and discrepancy detection.
 */

import { ReconciliationReport, StatementMetadata, Transaction, UnparsedLine } from '../types';
import { formatPaiseToIndianCurrency } from './money';

export interface ReconcileResult {
  transactions: Transaction[];
  report: ReconciliationReport;
}

export function reconcileTransactions(
  rawTransactions: Transaction[],
  metadata?: StatementMetadata,
  unparsedLines: UnparsedLine[] = []
): ReconcileResult {
  const transactions = [...rawTransactions];
  const totalRows = transactions.length;

  if (totalRows === 0) {
    const report: ReconciliationReport = {
      totalRows: 0,
      verifiedRows: 0,
      failingRows: 0,
      unverifiedRows: 0,
      isFullyReconciled: true,
      openingBalancePaise: metadata?.openingBalancePaise ?? null,
      closingBalancePaise: metadata?.closingBalancePaise ?? null,
      calculatedClosingBalancePaise: null,
      totalDebitsPaise: 0,
      totalCreditsPaise: 0,
      netDifferencePaise: 0,
      firstBreakingRowIndex: null,
      unparsedLinesCount: unparsedLines.length,
      totalCandidateLines: unparsedLines.length
    };
    return { transactions, report };
  }

  // 1. Detect statement direction and normalize to chronological (oldest to newest)
  const isChronological = detectSortDirection(transactions);
  if (!isChronological) {
    transactions.reverse();
  }

  // 2. Normalize intraday transaction ordering (for same-date transactions that were printed out of order)
  normalizeIntradayOrder(transactions);

  let verifiedRows = 0;
  let failingRows = 0;
  let unverifiedRows = 0;
  let firstBreakingRowIndex: number | null = null;
  let firstBreakingRowReason: string | undefined = undefined;

  let totalDebitsPaise = 0;
  let totalCreditsPaise = 0;
  let runningPaise: number | null = null;

  for (let i = 0; i < totalRows; i++) {
    const tx = transactions[i];

    if (i === 0) {
      // Row 0 establishes authentic account baseline
      tx.verificationStatus = 'verified';
      tx.calculatedBalancePaise = tx.balancePaise;
      tx.balanceDiscrepancyPaise = 0;
      verifiedRows++;
      runningPaise = tx.balancePaise;
      totalDebitsPaise += tx.debitPaise;
      totalCreditsPaise += tx.creditPaise;
      continue;
    }

    const expected = (runningPaise ?? 0) + tx.signedAmountPaise;

    if (tx.balancePaise === 0 && (expected !== 0 || tx.signedAmountPaise !== 0)) {
      // Line does not have stated balance printed
      tx.verificationStatus = 'unverified';
      tx.calculatedBalancePaise = expected;
      unverifiedRows++;
      runningPaise = expected;
    } else if (expected === tx.balancePaise) {
      // Perfect match
      tx.verificationStatus = 'verified';
      tx.calculatedBalancePaise = expected;
      tx.balanceDiscrepancyPaise = 0;
      verifiedRows++;
      runningPaise = tx.balancePaise;
    } else {
      // Check self-healing: was the sign inverted during debit/credit extraction?
      const invertedExpected = (runningPaise ?? 0) - tx.signedAmountPaise;
      if (invertedExpected === tx.balancePaise) {
        const oldDebit = tx.debitPaise;
        tx.debitPaise = tx.creditPaise;
        tx.creditPaise = oldDebit;
        tx.signedAmountPaise = tx.creditPaise - tx.debitPaise;
        tx.verificationStatus = 'verified';
        tx.calculatedBalancePaise = tx.balancePaise;
        tx.balanceDiscrepancyPaise = 0;
        verifiedRows++;
        runningPaise = tx.balancePaise;
      } else if (tx.debitPaise === 0 && tx.creditPaise === 0 && runningPaise !== null && tx.balancePaise > 0) {
        // If amount column was blank or omitted in statement row, deduce amount from balance change
        const delta = tx.balancePaise - runningPaise;
        if (delta > 0) {
          tx.creditPaise = delta;
        } else {
          tx.debitPaise = Math.abs(delta);
        }
        tx.signedAmountPaise = delta;
        tx.verificationStatus = 'verified';
        tx.calculatedBalancePaise = tx.balancePaise;
        tx.balanceDiscrepancyPaise = 0;
        verifiedRows++;
        runningPaise = tx.balancePaise;
      } else {
        tx.verificationStatus = 'failed';
        tx.calculatedBalancePaise = expected;
        const discrepancy = tx.balancePaise - expected;
        tx.balanceDiscrepancyPaise = discrepancy;
        failingRows++;
        tx.needsReview = true;
        tx.reviewReasons.push(`Running balance mismatch of ₹${formatPaiseToIndianCurrency(discrepancy)}`);

        if (firstBreakingRowIndex === null) {
          firstBreakingRowIndex = i;
          firstBreakingRowReason = `At row ${i + 1} (${tx.date}): expected balance ₹${formatPaiseToIndianCurrency(expected)}, but statement printed ₹${formatPaiseToIndianCurrency(tx.balancePaise)} (difference: ₹${formatPaiseToIndianCurrency(discrepancy)})`;
        }
        // Reset runningPaise to stated balance to allow subsequent rows to check local consistency
        runningPaise = tx.balancePaise;
      }
    }

    totalDebitsPaise += tx.debitPaise;
    totalCreditsPaise += tx.creditPaise;
  }

  const netDifferencePaise = totalCreditsPaise - totalDebitsPaise;
  const openingBalancePaise = transactions[0]?.balancePaise - transactions[0]?.signedAmountPaise;
  const closingBalancePaise = transactions[totalRows - 1]?.balancePaise;
  const calculatedClosingBalancePaise = openingBalancePaise + netDifferencePaise;

  const isFullyReconciled = failingRows === 0;

  const report: ReconciliationReport = {
    totalRows,
    verifiedRows,
    failingRows,
    unverifiedRows,
    isFullyReconciled,
    openingBalancePaise: openingBalancePaise ?? null,
    closingBalancePaise: closingBalancePaise ?? null,
    calculatedClosingBalancePaise,
    totalDebitsPaise,
    totalCreditsPaise,
    netDifferencePaise,
    firstBreakingRowIndex,
    firstBreakingRowReason,
    unparsedLinesCount: unparsedLines.length,
    totalCandidateLines: totalRows + unparsedLines.length
  };

  return { transactions, report };
}

/**
 * Normalizes intraday transaction ordering for transactions occurring on the same date.
 * If two consecutive transactions on the same date were parsed out of bank execution sequence,
 * swaps them to restore the continuous running balance chain.
 */
function normalizeIntradayOrder(transactions: Transaction[]): void {
  for (let i = 0; i < transactions.length - 1; i++) {
    const curr = transactions[i];
    const next = transactions[i + 1];

    if (curr.date === next.date && curr.balancePaise > 0 && next.balancePaise > 0) {
      const prevBal = i > 0 ? transactions[i - 1].balancePaise : null;
      if (prevBal !== null) {
        const currExpected = prevBal + curr.signedAmountPaise;
        const nextExpected = prevBal + next.signedAmountPaise;

        // If current row does not match prevBal, but next row DOES match prevBal:
        if (currExpected !== curr.balancePaise && nextExpected === next.balancePaise) {
          transactions[i] = next;
          transactions[i + 1] = curr;
        }
      }
    }
  }
}

/**
 * Determines whether rows are ordered chronologically (oldest first)
 * or reverse chronologically (newest first).
 */
function detectSortDirection(transactions: Transaction[]): boolean {
  if (transactions.length < 2) return true;

  // 1. Primary: compare first date and last date across statement period
  const firstDate = transactions[0].date;
  const lastDate = transactions[transactions.length - 1].date;
  if (firstDate && lastDate && firstDate !== lastDate) {
    return firstDate < lastDate;
  }

  // 2. If dates are identical or ambiguous: test running balance math
  let chronoMatches = 0;
  let reverseMatches = 0;
  const sampleSize = Math.min(transactions.length - 1, 25);

  for (let i = 0; i < sampleSize; i++) {
    const t0 = transactions[i];
    const t1 = transactions[i + 1];
    if (t0.balancePaise > 0 && t1.balancePaise > 0) {
      if (t0.balancePaise + t1.signedAmountPaise === t1.balancePaise) {
        chronoMatches++;
      }
      if (t1.balancePaise + t0.signedAmountPaise === t0.balancePaise) {
        reverseMatches++;
      }
    }
  }

  if (reverseMatches > chronoMatches) return false;
  return true;
}
