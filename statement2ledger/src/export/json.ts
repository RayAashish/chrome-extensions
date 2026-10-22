/**
 * Statement2Ledger - JSON Exporter & Tax-Season Summary Calculator
 */

import { paiseToRupees } from '../core/money';
import { ParseResult, Transaction } from '../types';

export interface TaxSeasonSummary {
  totalInterestPaise: number;
  totalInterestRupees: number;
  totalTdsPaise: number;
  totalTdsRupees: number;
  totalFreelanceIncomePaise: number;
  totalFreelanceIncomeRupees: number;
  totalAdvanceTaxPaise: number;
  totalAdvanceTaxRupees: number;
  largeCredits: Array<{
    date: string;
    amountRupees: number;
    vendor: string;
    description: string;
    rawNarration: string;
  }>;
  disclaimer: string;
}

export function calculateTaxSeasonSummary(transactions: Transaction[]): TaxSeasonSummary {
  let totalInterestPaise = 0;
  let totalTdsPaise = 0;
  let totalFreelanceIncomePaise = 0;
  let totalAdvanceTaxPaise = 0;
  const largeCredits: TaxSeasonSummary['largeCredits'] = [];

  for (const tx of transactions) {
    if (tx.category === 'Interest' || tx.mode === 'INTEREST') {
      totalInterestPaise += tx.creditPaise;
    }
    if (tx.category === 'Taxes' && tx.subcategory === 'TDS') {
      totalTdsPaise += tx.debitPaise;
    }
    if (tx.category === 'Taxes' && (tx.subcategory === 'Advance Tax' || tx.subcategory === 'Income Tax / Advance Tax')) {
      totalAdvanceTaxPaise += tx.debitPaise;
    }
    if (tx.category === 'Freelance Income' || (tx.isBusiness && tx.creditPaise > 0)) {
      totalFreelanceIncomePaise += tx.creditPaise;
    }
    // Large credits >= ₹50,000 (5,000,000 paise)
    if (tx.creditPaise >= 5000000) {
      largeCredits.push({
        date: tx.date,
        amountRupees: paiseToRupees(tx.creditPaise),
        vendor: tx.vendor,
        description: tx.description,
        rawNarration: tx.rawNarration
      });
    }
  }

  return {
    totalInterestPaise,
    totalInterestRupees: paiseToRupees(totalInterestPaise),
    totalTdsPaise,
    totalTdsRupees: paiseToRupees(totalTdsPaise),
    totalFreelanceIncomePaise,
    totalFreelanceIncomeRupees: paiseToRupees(totalFreelanceIncomePaise),
    totalAdvanceTaxPaise,
    totalAdvanceTaxRupees: paiseToRupees(totalAdvanceTaxPaise),
    largeCredits,
    disclaimer: 'This summary is a computational convenience helper for tax preparation. It does NOT constitute legal, tax, or financial advice.'
  };
}

export function generateLedgerJSON(result: ParseResult, maskSensitiveInfo = true): Blob {
  const taxSummary = calculateTaxSeasonSummary(result.transactions);

  const cleanTransactions = result.transactions.map((tx) => {
    let raw = tx.rawNarration;
    if (maskSensitiveInfo) {
      raw = raw.replace(/\b([0-9]{6,14})([0-9]{4})\b/g, 'XXXX$2');
    }
    return {
      ...tx,
      rawNarration: raw,
      debitRupees: paiseToRupees(tx.debitPaise),
      creditRupees: paiseToRupees(tx.creditPaise),
      signedAmountRupees: paiseToRupees(tx.signedAmountPaise),
      balanceRupees: paiseToRupees(tx.balancePaise)
    };
  });

  const exportObject = {
    app: 'Statement2Ledger',
    version: '1.0.0',
    exportTimestamp: new Date().toISOString(),
    metadata: result.metadata,
    reconciliation: result.reconciliation,
    taxSeasonHelper: taxSummary,
    transactionsCount: cleanTransactions.length,
    transactions: cleanTransactions,
    unparsedLines: result.unparsedLines
  };

  const jsonString = JSON.stringify(exportObject, null, 2);
  return new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
}
