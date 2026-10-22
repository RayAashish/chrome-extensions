/**
 * Statement2Ledger - ICICI Bank Statement Parser (PDF & CSV)
 * 
 * Target layout:
 * Value Date | Transaction Date | Cheque Number | Transaction Remarks | Withdrawal Amount (INR ) | Deposit Amount (INR ) | Balance (INR )
 */

import { defaultCategorizationEngine } from '../core/categorize';
import { extractDateFromCell, parseIndianDate } from '../core/dates';
import { isHeaderRow, isNoiseOrSummaryRow } from '../core/layout';
import { parseIndianAmountToPaise } from '../core/money';
import { parseNarration } from '../core/narration';
import { ParseOptions, StatementMetadata, Transaction, UnparsedLine } from '../types';
import { DetectionResult, ParsedBankData, StatementParser } from './types';

export class IciciParser implements StatementParser {
  public id = 'icici';
  public name = 'ICICI Bank';

  public detect(sampleText: string, metadata?: { filename?: string }): DetectionResult {
    const upper = sampleText.toUpperCase();
    const filenameUpper = (metadata?.filename || '').toUpperCase();

    let score = 0;
    if (upper.includes('ICICI BANK') || upper.includes('ICIC000')) score += 0.6;
    if (filenameUpper.includes('ICICI')) score += 0.2;
    if (upper.includes('TRANSACTION REMARKS') && upper.includes('WITHDRAWAL AMOUNT')) score += 0.2;
    if (upper.includes('DETAILED STATEMENT') && upper.includes('ICICI')) score += 0.2;

    return {
      confidence: Math.min(score, 1.0),
      bankName: 'ICICI Bank'
    };
  }

  public extractMetadata(sampleText: string, rawRows?: string[][]): StatementMetadata {
    let acctMasked = 'XXXX9999';
    const acctMatch = sampleText.match(/(?:Account\s+(?:No|Number|A\/c\s*No)[\s.:]+)([0-9X]+)/i);
    if (acctMatch) {
      const full = acctMatch[1].trim();
      const last4 = full.slice(-4);
      acctMasked = `XXXX${last4}`;
    }

    let custName = 'Customer';
    const nameMatch = sampleText.match(/(?:Customer\s+Name|Name)[\s.:]+([A-Z\s]{4,30})/i);
    if (nameMatch) {
      custName = nameMatch[1].trim();
    }

    let openingPaise: number | undefined;
    let closingPaise: number | undefined;

    const opMatch = sampleText.match(/Opening\s+Balance\s*[:\-]?\s*([0-9,.]+)/i);
    if (opMatch) {
      openingPaise = parseIndianAmountToPaise(opMatch[1]).paise;
    }

    const clMatch = sampleText.match(/Closing\s+Balance\s*[:\-]?\s*([0-9,.]+)/i);
    if (clMatch) {
      closingPaise = parseIndianAmountToPaise(clMatch[1]).paise;
    }

    return {
      bankName: 'ICICI Bank',
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
    let valDateCol = -1;
    let txnDateCol = -1;
    let chqCol = -1;
    let remarksCol = -1;
    let wdlCol = -1;
    let depCol = -1;
    let amountCol = -1;
    let typeCol = -1;
    let balCol = -1;

    for (let i = 0; i < Math.min(rows.length, 250); i++) {
      const line = rows[i].join(' ').toUpperCase();
      if ((line.includes('DATE') || line.includes('VALUE')) && (line.includes('REMARK') || line.includes('PARTICULAR') || line.includes('DESC') || line.includes('DETAIL'))) {
        headerIdx = i;
        const row = rows[i].map((c) => c.toUpperCase());
        valDateCol = row.findIndex((c) => c.includes('VALUE DATE') || c.includes('VALUE DT'));
        txnDateCol = row.findIndex((c) => c.includes('TRANSACTION DATE') || (c.includes('DATE') && !c.includes('VALUE')));
        chqCol = row.findIndex((c) => c.includes('CHEQUE') || c.includes('CHQ'));
        remarksCol = row.findIndex((c) => c.includes('REMARK') || c.includes('PARTICULAR') || c.includes('DESCRIPTION') || c.includes('DETAIL'));
        wdlCol = row.findIndex((c) => c.includes('WITHDRAWAL') || (/\bDR\b/.test(c) && !c.includes('BRANCH')));
        depCol = row.findIndex((c) => c.includes('DEPOSIT') || (/\bCR\b/.test(c) && !c.includes('BRANCH')));
        amountCol = row.findIndex((c) => c === 'AMOUNT' || c.includes('AMOUNT (INR'));
        typeCol = row.findIndex((c) => c.includes('CR/DR') || c === 'TYPE');
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

    if (txnDateCol === -1) txnDateCol = 0;
    if (remarksCol === -1) remarksCol = 1;

    let activeTx: Transaction | null = null;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0 || row.every((c) => !c.trim())) continue;
      if (isHeaderRow(row.join(' '))) continue;

      let dateObj = extractDateFromCell(row[txnDateCol]);
      let actualDateCol = txnDateCol;

      if (!dateObj && valDateCol !== -1) {
        dateObj = extractDateFromCell(row[valDateCol]);
        if (dateObj) actualDateCol = valDateCol;
      }

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

        let actualRemarksCol = remarksCol;
        if (actualRemarksCol === actualDateCol) actualRemarksCol = actualDateCol + 1;
        const rawRemarks = (row[actualRemarksCol] || '').trim();
        const rawChq = chqCol !== -1 && chqCol !== actualDateCol ? row[chqCol] || '' : '';
        const rawValDate = valDateCol !== -1 && valDateCol !== actualDateCol ? parseIndianDate(row[valDateCol]) : undefined;

        const rawBal = balCol !== -1 ? row[balCol] : '';
        let balancePaise = parseIndianAmountToPaise(rawBal).paise;
        if (balancePaise === 0) {
          balancePaise = parseIndianAmountToPaise(row[row.length - 1]).paise;
        }

        let debitPaise = 0;
        let creditPaise = 0;

        if (wdlCol !== -1 || depCol !== -1) {
          const rawWdl = wdlCol !== -1 ? row[wdlCol] : '';
          const rawDep = depCol !== -1 ? row[depCol] : '';
          debitPaise = parseIndianAmountToPaise(rawWdl).paise;
          creditPaise = parseIndianAmountToPaise(rawDep).paise;
        } else if (amountCol !== -1) {
          const amtParsed = parseIndianAmountToPaise(row[amountCol]);
          const rawType = typeCol !== -1 ? row[typeCol].toUpperCase() : '';
          const isDebit = rawType.includes('DR') || amtParsed.isDebit;
          if (isDebit) debitPaise = amtParsed.paise;
          else creditPaise = amtParsed.paise;
        }

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
            .slice(Math.max(actualDateCol + 1, actualRemarksCol + 1))
            .filter((cell) => /[0-9,]+\.[0-9]{2}/.test(cell));
          if (amountCandidates.length >= 2) {
            const txAmt = parseIndianAmountToPaise(amountCandidates[0]);
            if (row.join(' ').toUpperCase().includes('DR') || /\b(UPI|POS|ATM|WDL|CHQ|DEBIT)\b/i.test(rawRemarks)) {
              debitPaise = txAmt.paise;
            } else {
              creditPaise = txAmt.paise;
            }
          }
        }

        const isDebit = debitPaise > 0;
        const signedAmountPaise = creditPaise - debitPaise;

        const parsedNarr = parseNarration(rawRemarks || row.slice(1, row.length - 2).join(' '));
        const cat = defaultCategorizationEngine.categorize(
          parsedNarr.vendor,
          rawRemarks,
          parsedNarr.mode,
          isDebit,
          isDebit ? debitPaise : creditPaise
        );

        activeTx = {
          id: `icici-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          date: dateObj.iso,
          valueDate: rawValDate || dateObj.iso,
          description: parsedNarr.cleanedDescription,
          rawNarration: rawRemarks || parsedNarr.cleanedDescription,
          mode: parsedNarr.mode,
          vendor: parsedNarr.vendor,
          reference: rawChq.trim() || parsedNarr.reference,
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
          const extra = row[remarksCol] ? row[remarksCol].trim() : fullRowText;
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
            id: `icici-unparsed-${r}`,
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
          id: `icici-txt-${i}-${Date.now()}`,
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
          id: `icici-unparsed-${i}`,
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
