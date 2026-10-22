/**
 * Statement2Ledger - State Bank of India (SBI) Statement Parser (PDF & CSV)
 * 
 * Target layout:
 * Txn Date | Value Date | Description | Ref No./Cheque No. | Branch Code | Debit | Credit | Balance
 */

import { defaultCategorizationEngine } from '../core/categorize';
import { extractDateFromCell, parseIndianDate } from '../core/dates';
import { isHeaderRow, isNoiseOrSummaryRow } from '../core/layout';
import { parseIndianAmountToPaise } from '../core/money';
import { parseNarration } from '../core/narration';
import { ParseOptions, StatementMetadata, Transaction, UnparsedLine } from '../types';
import { DetectionResult, ParsedBankData, StatementParser } from './types';

export class SbiParser implements StatementParser {
  public id = 'sbi';
  public name = 'State Bank of India';

  public detect(sampleText: string, metadata?: { filename?: string }): DetectionResult {
    const upper = sampleText.toUpperCase();
    const filenameUpper = (metadata?.filename || '').toUpperCase();

    let score = 0;
    if (upper.includes('STATE BANK OF INDIA') || upper.includes('SBIN000') || upper.includes('ONLINESBI')) score += 0.6;
    if (filenameUpper.includes('SBI')) score += 0.2;
    if (upper.includes('TXN DATE') && upper.includes('BRANCH CODE')) score += 0.2;
    if (upper.includes('ACCOUNT STATEMENT') && upper.includes('SBI')) score += 0.2;

    return {
      confidence: Math.min(score, 1.0),
      bankName: 'State Bank of India'
    };
  }

  public extractMetadata(sampleText: string, rawRows?: string[][]): StatementMetadata {
    // Account Number extraction
    let acctMasked = 'XXXX9999';
    const acctMatch = sampleText.match(/(?:Account\s+(?:No|Number|A\/c\s*No)[\s.:]+)([0-9X]+)/i);
    if (acctMatch) {
      const full = acctMatch[1].trim();
      const last4 = full.slice(-4);
      acctMasked = `XXXX${last4}`;
    }

    // Customer Name extraction
    let custName = 'Customer';
    const nameMatch = sampleText.match(/(?:Account\s+Name[\s.:]+)([A-Z\s]{4,30})/i);
    if (nameMatch) {
      custName = nameMatch[1].trim();
    }

    // Opening & Closing Balance from summary
    let openingPaise: number | undefined;
    let closingPaise: number | undefined;

    const opMatch = sampleText.match(/Opening\s+Balance\s*[:\-]\s*([0-9,.]+)/i);
    if (opMatch) {
      openingPaise = parseIndianAmountToPaise(opMatch[1]).paise;
    }

    const clMatch = sampleText.match(/Closing\s+Balance\s*[:\-]\s*([0-9,.]+)/i);
    if (clMatch) {
      closingPaise = parseIndianAmountToPaise(clMatch[1]).paise;
    }

    return {
      bankName: 'State Bank of India',
      accountNumberMasked: acctMasked,
      customerNameMasked: custName,
      currency: 'INR',
      sourceFormat: rawRows ? 'CSV' : 'PDF',
      openingBalancePaise: openingPaise,
      closingBalancePaise: closingPaise
    };
  }

  public async parse(
    data: { rawText?: string; rows?: string[][]; clusters?: any[] },
    meta: StatementMetadata,
    options: ParseOptions
  ): Promise<ParsedBankData> {
    if (data.rows && data.rows.length > 0) {
      const res = this.parseCsvRows(data.rows, meta, options);
      if (res.transactions.length > 0) return res;
    }
    return this.parseTextLines(data.rawText || '', meta, options);
  }

  private parseCsvRows(rows: string[][], meta: StatementMetadata, options: ParseOptions): ParsedBankData {
    const transactions: Transaction[] = [];
    const unparsedLines: UnparsedLine[] = [];

    let headerIdx = -1;
    let txnDateCol = 0;
    let valDateCol = 1;
    let descCol = 2;
    let refCol = 3;
    let debitCol = 5;
    let creditCol = 6;
    let balCol = 7;

    for (let i = 0; i < Math.min(rows.length, 250); i++) {
      const line = rows[i].join(' ').toUpperCase();
      if ((line.includes('TXN DATE') || line.includes('DATE')) && (line.includes('DESCRIPTION') || line.includes('NARRATION') || line.includes('PARTICULAR'))) {
        headerIdx = i;
        const row = rows[i].map((c) => c.toUpperCase());
        txnDateCol = row.findIndex((c) => c.includes('TXN DATE') || (c.includes('DATE') && !c.includes('VALUE')));
        valDateCol = row.findIndex((c) => c.includes('VALUE'));
        descCol = row.findIndex((c) => c.includes('DESCRIPTION') || c.includes('NARRATION') || c.includes('PARTICULAR') || c.includes('REMARK'));
        refCol = row.findIndex((c) => c.includes('REF') || c.includes('CHEQUE') || c.includes('CHQ'));
        debitCol = row.findIndex((c) => (c.includes('DEBIT') || /\bDR\b/i.test(c)) && !c.includes('BRANCH'));
        creditCol = row.findIndex((c) => (c.includes('CREDIT') || /\bCR\b/i.test(c)) && !c.includes('BRANCH'));
        balCol = row.findIndex((c) => c.includes('BALANCE') || c.includes('CLOSING') || c === 'BAL');
        break;
      }
    }

    if (headerIdx === -1) {
      headerIdx = 0;
      for (const row of rows.slice(0, 25)) {
        for (let c = 0; c < Math.min(row.length, 4); c++) {
          if (extractDateFromCell(row[c])) {
            txnDateCol = c;
            break;
          }
        }
      }
    }

    let activeTx: Transaction | null = null;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0 || row.every((c) => !c.trim())) continue;
      if (isHeaderRow(row.join(' '))) continue;

      let dateObj = extractDateFromCell(row[txnDateCol]);
      let actualDateCol = txnDateCol;

      if (!dateObj) {
        for (let c = 0; c < Math.min(row.length, 3); c++) {
          const cand = extractDateFromCell(row[c]);
          if (cand) {
            dateObj = cand;
            actualDateCol = c;
            break;
          }
        }
      }

      if (dateObj) {
        if (activeTx) transactions.push(activeTx);

        let actualDescCol = descCol;
        if (actualDescCol === actualDateCol) actualDescCol = actualDateCol + 1;
        const rawNarr = (row[actualDescCol] || '').trim();
        const rawRef = refCol !== -1 && refCol !== actualDateCol ? row[refCol] || '' : '';
        const rawValDate = valDateCol !== -1 ? parseIndianDate(row[valDateCol]) : undefined;

        let balancePaise = balCol !== -1 ? parseIndianAmountToPaise(row[balCol]).paise : 0;
        if (balancePaise === 0) {
          balancePaise = parseIndianAmountToPaise(row[row.length - 1]).paise;
        }

        let debitPaise = debitCol !== -1 ? parseIndianAmountToPaise(row[debitCol]).paise : 0;
        let creditPaise = creditCol !== -1 ? parseIndianAmountToPaise(row[creditCol]).paise : 0;

        // Prevent balance from sliding into credit if columns shifted
        if (creditPaise > 0 && creditPaise === balancePaise && debitPaise > 0) {
          creditPaise = 0;
        }

        // Align amounts with mathematical running balance change if available
        if (activeTx && activeTx.balancePaise > 0 && balancePaise > 0) {
          const delta = balancePaise - activeTx.balancePaise;
          if (debitPaise === 0 && creditPaise === 0) {
            if (delta < 0) debitPaise = Math.abs(delta);
            else if (delta > 0) creditPaise = delta;
          } else if (debitPaise > 0 && delta > 0 && Math.abs(delta - debitPaise) === 0) {
            creditPaise = debitPaise;
            debitPaise = 0;
          } else if (creditPaise > 0 && delta < 0 && Math.abs(Math.abs(delta) - creditPaise) === 0) {
            debitPaise = creditPaise;
            creditPaise = 0;
          }
        } else if (debitPaise === 0 && creditPaise === 0) {
          const amountCandidates = row
            .slice(Math.max(actualDateCol + 1, actualDescCol + 1))
            .filter((cell) => /[0-9,]+\.[0-9]{2}/.test(cell));
          if (amountCandidates.length >= 2) {
            const txAmt = parseIndianAmountToPaise(amountCandidates[0]);
            if (row.join(' ').toUpperCase().includes('DR') || /\b(UPI|POS|ATM|WDL|CHQ|DEBIT)\b/i.test(rawNarr)) {
              debitPaise = txAmt.paise;
            } else {
              creditPaise = txAmt.paise;
            }
          }
        }

        const isDebit = debitPaise > 0;
        const signedAmountPaise = creditPaise - debitPaise;

        const parsedNarr = parseNarration(rawNarr || row.slice(1, row.length - 2).join(' '));
        const cat = defaultCategorizationEngine.categorize(
          parsedNarr.vendor,
          rawNarr,
          parsedNarr.mode,
          isDebit,
          isDebit ? debitPaise : creditPaise
        );

        activeTx = {
          id: `sbi-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          date: dateObj.iso,
          valueDate: rawValDate || dateObj.iso,
          description: parsedNarr.cleanedDescription,
          rawNarration: rawNarr || parsedNarr.cleanedDescription,
          mode: parsedNarr.mode,
          vendor: parsedNarr.vendor,
          reference: rawRef.trim() || parsedNarr.reference,
          debitPaise,
          creditPaise,
          signedAmountPaise,
          balancePaise,
          category: cat.category,
          subcategory: cat.subcategory,
          tags: cat.tags,
          sourceFile: options.sourceFileName,
          confidence: cat.confidence,
          needsReview: cat.needsReview,
          reviewReasons: cat.reviewReasons,
          isBusiness: cat.isBusiness,
          verificationStatus: 'unverified'
        };
      } else {
        const fullRowText = row.join(' ').trim();
        if (isNoiseOrSummaryRow(fullRowText)) continue;

        if (activeTx) {
          const extra = row[descCol] ? row[descCol].trim() : fullRowText;
          if (extra) {
            activeTx.rawNarration += ' ' + extra;
            const updatedNarr = parseNarration(activeTx.rawNarration);
            activeTx.description = updatedNarr.cleanedDescription;
            activeTx.vendor = updatedNarr.vendor;
            activeTx.mode = updatedNarr.mode;
            if (!activeTx.reference && updatedNarr.reference) {
              activeTx.reference = updatedNarr.reference;
            }
          }
        } else if (fullRowText) {
          unparsedLines.push({
            id: `sbi-unparsed-${r}`,
            sourceFile: options.sourceFileName,
            lineNumber: r + 1,
            rawText: fullRowText,
            reason: 'Row without date or active transaction context'
          });
        }
      }
    }

    if (activeTx) {
      transactions.push(activeTx);
    }

    return { transactions, unparsedLines, metadata: meta };
  }

  private parseTextLines(text: string, meta: StatementMetadata, options: ParseOptions): ParsedBankData {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const transactions: Transaction[] = [];
    const unparsedLines: UnparsedLine[] = [];

    let activeTx: Transaction | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isNoiseOrSummaryRow(line)) continue;
      if (isHeaderRow(line)) continue;

      let dateObj = extractDateFromCell(line.substring(0, 50));
      if (!dateObj && /\b[0-9,]+\.[0-9]{2}\b/.test(line)) {
        dateObj = extractDateFromCell(line);
      }

      if (dateObj) {
        if (activeTx) transactions.push(activeTx);

        const amountMatches = line.match(/\b([0-9,]+\.[0-9]{2})\b/g) || [];
        let rawDebit = '';
        let rawCredit = '';
        let rawBal = '';

        if (amountMatches.length >= 2) {
          rawBal = amountMatches[amountMatches.length - 1];
          const amountVal = amountMatches[amountMatches.length - 2];
          const isDebit = line.toUpperCase().includes('DR') || (!line.toUpperCase().includes('CR') && amountMatches.length >= 3);
          if (isDebit) rawDebit = amountVal;
          else rawCredit = amountVal;
        } else if (amountMatches.length === 1) {
          const amountVal = amountMatches[0];
          if (line.toUpperCase().includes('DR')) rawDebit = amountVal;
          else rawCredit = amountVal;
        }

        const debitPaise = parseIndianAmountToPaise(rawDebit).paise;
        const creditPaise = parseIndianAmountToPaise(rawCredit).paise;
        const isDebit = debitPaise > 0;
        const signedAmountPaise = creditPaise - debitPaise;
        const balancePaise = parseIndianAmountToPaise(rawBal).paise;

        let rawNarr = line;
        const dateIdx = line.indexOf(dateObj.raw);
        if (dateIdx !== -1) {
          rawNarr = line.slice(dateIdx + dateObj.raw.length);
        }
        rawNarr = rawNarr.replace(/\b([0-9,]+\.[0-9]{2})\b/g, '').trim();

        const parsedNarr = parseNarration(rawNarr);
        const cat = defaultCategorizationEngine.categorize(
          parsedNarr.vendor,
          rawNarr,
          parsedNarr.mode,
          isDebit,
          isDebit ? debitPaise : creditPaise
        );

        activeTx = {
          id: `sbi-txt-${i}-${Date.now()}`,
          date: dateObj.iso,
          valueDate: dateObj.iso,
          description: parsedNarr.cleanedDescription,
          rawNarration: rawNarr,
          mode: parsedNarr.mode,
          vendor: parsedNarr.vendor,
          reference: parsedNarr.reference,
          debitPaise,
          creditPaise,
          signedAmountPaise,
          balancePaise,
          category: cat.category,
          subcategory: cat.subcategory,
          tags: cat.tags,
          sourceFile: options.sourceFileName,
          confidence: cat.confidence,
          needsReview: cat.needsReview,
          reviewReasons: cat.reviewReasons,
          isBusiness: cat.isBusiness,
          verificationStatus: 'unverified'
        };
        continue;
      }

      if (activeTx) {
        activeTx.rawNarration += ' ' + line;
        const updatedNarr = parseNarration(activeTx.rawNarration);
        activeTx.description = updatedNarr.cleanedDescription;
        activeTx.vendor = updatedNarr.vendor;
        activeTx.mode = updatedNarr.mode;
        if (!activeTx.reference && updatedNarr.reference) {
          activeTx.reference = updatedNarr.reference;
        }
      } else {
        unparsedLines.push({
          id: `sbi-unparsed-${i}`,
          sourceFile: options.sourceFileName,
          lineNumber: i + 1,
          rawText: line,
          reason: 'Unclassified text'
        });
      }
    }

    if (activeTx) {
      transactions.push(activeTx);
    }

    return { transactions, unparsedLines, metadata: meta };
  }
}
