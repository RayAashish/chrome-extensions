/**
 * Statement2Ledger - Generic Table Parser (Fallback for Axis, Kotak, PNB, BoB, IDFC, etc.)
 * 
 * Dynamically detects column roles or executes user-provided manual column mappings.
 */

import { defaultCategorizationEngine } from '../core/categorize';
import { extractDateFromCell, parseIndianDate } from '../core/dates';
import { isHeaderRow, isNoiseOrSummaryRow } from '../core/layout';
import { parseIndianAmountToPaise } from '../core/money';
import { parseNarration } from '../core/narration';
import { ManualColumnMapping, ParseOptions, StatementMetadata, Transaction, UnparsedLine } from '../types';
import { DetectionResult, ParsedBankData, StatementParser } from './types';

export class GenericParser implements StatementParser {
  public id = 'generic';
  public name = 'Generic Bank Statement';

  public detect(_sampleText: string): DetectionResult {
    return {
      confidence: 0.3,
      bankName: 'Bank Statement'
    };
  }

  public extractMetadata(sampleText: string, rawRows?: string[][]): StatementMetadata {
    let acctMasked = 'XXXX9999';
    const acctMatch = sampleText.match(/(?:Account\s+(?:No|Number|A\/c\s*No)[\s.:]+)([0-9X]+)/i);
    if (acctMatch) {
      const full = acctMatch[1].trim();
      acctMasked = `XXXX${full.slice(-4)}`;
    }

    return {
      bankName: 'Bank Statement',
      accountNumberMasked: acctMasked,
      customerNameMasked: 'Account Holder',
      currency: 'INR',
      sourceFormat: rawRows ? 'CSV' : 'PDF'
    };
  }

  public async parse(
    data: { rawText?: string; rows?: string[][]; clusters?: any[] },
    meta: StatementMetadata,
    options: ParseOptions
  ): Promise<ParsedBankData> {
    const rows = data.rows || [];
    if (rows.length > 0) {
      const res = this.parseRows(rows, meta, options);
      if (res.transactions.length > 0) {
        return res;
      }
    }

    // Fallback: line-by-line universal text parsing
    return this.parseTextLines(data.rawText || '', meta, options);
  }

  private parseRows(rows: string[][], meta: StatementMetadata, options: ParseOptions): ParsedBankData {
    const transactions: Transaction[] = [];
    const unparsedLines: UnparsedLine[] = [];

    const mapping = options.manualMapping || this.inferMapping(rows);

    let activeTx: Transaction | null = null;
    const startRow = (mapping.headerRowIndex >= 0 ? mapping.headerRowIndex : 0) + 1;

    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0 || row.every((c) => !c.trim())) continue;
      if (isHeaderRow(row.join(' '))) continue;

      // Check designated date column, or check first 3 columns
      let dateObj = extractDateFromCell(row[mapping.dateColIndex]);
      let actualDateCol = mapping.dateColIndex;

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

        // Narration column
        let narrCol = mapping.narrationColIndex;
        if (narrCol === actualDateCol) narrCol = actualDateCol + 1;
        const rawNarr = (row[narrCol] || '').trim();

        const rawRef =
          mapping.refColIndex !== undefined && mapping.refColIndex !== -1 && mapping.refColIndex !== actualDateCol
            ? row[mapping.refColIndex] || ''
            : '';

        const rawBal = mapping.balanceColIndex !== undefined && mapping.balanceColIndex !== -1 ? row[mapping.balanceColIndex] : '';
        let balancePaise = parseIndianAmountToPaise(rawBal).paise;

        if (balancePaise === 0) {
          // Check last column for balance
          const lastCell = row[row.length - 1];
          balancePaise = parseIndianAmountToPaise(lastCell).paise;
        }

        let debitPaise = 0;
        let creditPaise = 0;

        if (mapping.debitColIndex !== undefined && mapping.creditColIndex !== undefined) {
          debitPaise = parseIndianAmountToPaise(row[mapping.debitColIndex]).paise;
          creditPaise = parseIndianAmountToPaise(row[mapping.creditColIndex]).paise;
        } else if (mapping.amountColIndex !== undefined) {
          const parsedAmt = parseIndianAmountToPaise(row[mapping.amountColIndex]);
          const rawType = mapping.typeColIndex !== undefined ? (row[mapping.typeColIndex] || '').toUpperCase() : '';
          const isDebit = rawType.includes('DR') || parsedAmt.isDebit;
          if (isDebit) debitPaise = parsedAmt.paise;
          else creditPaise = parsedAmt.paise;
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
          // Dynamic amount finding from remaining columns
          const amountCandidates = row
            .slice(Math.max(actualDateCol + 1, narrCol + 1))
            .filter((cell) => /[0-9,]+\.[0-9]{2}/.test(cell) || /\b[0-9,]{3,}\b/.test(cell));
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
          id: `gen-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          date: dateObj.iso,
          valueDate: dateObj.iso,
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
          confidence: cat.confidence * 0.9,
          needsReview: cat.needsReview,
          reviewReasons: cat.reviewReasons,
          isBusiness: cat.isBusiness,
          verificationStatus: 'unverified'
        };
      } else {
        const fullRowText = row.join(' ').trim();
        if (isNoiseOrSummaryRow(fullRowText)) continue;

        if (activeTx) {
          const extra = row[mapping.narrationColIndex] ? row[mapping.narrationColIndex].trim() : fullRowText;
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
            id: `gen-unparsed-${r}`,
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

      // Search for any date in the line
      let dateObj = extractDateFromCell(line.substring(0, 50));
      if (!dateObj && /\b[0-9,]+\.[0-9]{2}\b/.test(line)) {
        dateObj = extractDateFromCell(line);
      }

      if (dateObj) {
        if (activeTx) transactions.push(activeTx);

        // Extract all currency formatted numbers on the line
        const amountMatches = line.match(/\b([0-9,]+\.[0-9]{2})\b/g) || [];
        let rawDebit = '';
        let rawCredit = '';
        let rawBal = '';

        if (amountMatches.length >= 3) {
          rawBal = amountMatches[amountMatches.length - 1];
          rawCredit = amountMatches[amountMatches.length - 2];
          rawDebit = amountMatches[amountMatches.length - 3];
        } else if (amountMatches.length === 2) {
          // Last number is balance, second to last is transaction amount
          rawBal = amountMatches[1];
          const amtStr = amountMatches[0];
          const upperLine = line.toUpperCase();
          let isDebit = false;
          if (upperLine.includes('DR') || upperLine.includes('DEBIT') || upperLine.includes('WITHDRAWAL')) {
            isDebit = true;
          } else if (upperLine.includes('CR') || upperLine.includes('CREDIT') || upperLine.includes('DEPOSIT')) {
            isDebit = false;
          } else if (activeTx && activeTx.balancePaise > 0) {
            const currentBalPaise = parseIndianAmountToPaise(rawBal).paise;
            isDebit = currentBalPaise < activeTx.balancePaise;
          } else {
            const isCreditKeyword = /\b(SALARY|INTEREST|REFUND|REVERSAL|DIVIDEND|BY\s+TRANSFER)\b/i.test(line);
            isDebit = !isCreditKeyword;
          }
          if (isDebit) rawDebit = amtStr;
          else rawCredit = amtStr;
        } else if (amountMatches.length === 1) {
          const amtStr = amountMatches[0];
          if (line.toUpperCase().includes('DR')) rawDebit = amtStr;
          else rawCredit = amtStr;
        }

        const debitPaise = parseIndianAmountToPaise(rawDebit).paise;
        const creditPaise = parseIndianAmountToPaise(rawCredit).paise;
        const isDebit = debitPaise > 0;
        const signedAmountPaise = creditPaise - debitPaise;
        const balancePaise = parseIndianAmountToPaise(rawBal).paise;

        // Narration is the middle between date and amounts
        let rawNarr = line;
        const dateIdx = line.indexOf(dateObj.raw);
        if (dateIdx !== -1) {
          rawNarr = line.slice(dateIdx + dateObj.raw.length);
        }
        // Remove amounts from narration
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
          id: `gen-txt-${i}-${Date.now()}`,
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
          confidence: cat.confidence * 0.85,
          needsReview: cat.needsReview,
          reviewReasons: cat.reviewReasons,
          isBusiness: cat.isBusiness,
          verificationStatus: 'unverified'
        };
        continue;
      }

      // Continuation line
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
          id: `gen-txt-unparsed-${i}`,
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

  private inferMapping(rows: string[][]): ManualColumnMapping {
    let headerIdx = -1;
    let dateCol = 0;
    let narrCol = 1;
    let debitCol: number | undefined;
    let creditCol: number | undefined;
    let amountCol: number | undefined;
    let typeCol: number | undefined;
    let balCol: number | undefined;

    // Scan for header row
    for (let r = 0; r < Math.min(rows.length, 250); r++) {
      const row = rows[r];
      const line = row.join(' ').toUpperCase();
      if ((line.includes('DATE') || line.includes('TXN')) && (line.includes('NARRATION') || line.includes('PARTICULAR') || line.includes('DESC') || line.includes('REMARK') || line.includes('DETAIL'))) {
        headerIdx = r;
        for (let c = 0; c < row.length; c++) {
          const colName = row[c].toUpperCase();
          if ((colName.includes('DATE') || colName.includes('TXN')) && !colName.includes('VALUE') && dateCol === 0) {
            dateCol = c;
          } else if (colName.includes('NARRATION') || colName.includes('PARTICULAR') || colName.includes('DESC') || colName.includes('REMARK') || colName.includes('DETAIL')) {
            narrCol = c;
          } else if (colName.includes('WITHDRAWAL') || (colName.includes('DEBIT') && !colName.includes('CREDIT')) || (/\bDR\b/.test(colName) && !colName.includes('BRANCH'))) {
            debitCol = c;
          } else if (colName.includes('DEPOSIT') || colName.includes('CREDIT') || (/\bCR\b/.test(colName) && !colName.includes('BRANCH'))) {
            creditCol = c;
          } else if (colName.includes('AMOUNT') && !colName.includes('BALANCE')) {
            amountCol = c;
          } else if (colName.includes('CR/DR') || colName === 'TYPE') {
            typeCol = c;
          } else if (colName.includes('BALANCE') || colName.includes('CLOSING') || colName === 'BAL') {
            balCol = c;
          }
        }
        break;
      }
    }

    // Fallback if no header row was detected: sample data rows
    if (headerIdx === -1) {
      headerIdx = 0;
      // Search first 25 rows for date column
      for (const row of rows.slice(0, 25)) {
        for (let c = 0; c < Math.min(row.length, 4); c++) {
          if (extractDateFromCell(row[c])) {
            dateCol = c;
            break;
          }
        }
      }
      // Longest column is usually narration
      let maxLen = 0;
      for (const row of rows.slice(0, 25)) {
        for (let c = 0; c < row.length; c++) {
          if (c !== dateCol && row[c].length > maxLen) {
            maxLen = row[c].length;
            narrCol = c;
          }
        }
      }
    }

    return {
      headerRowIndex: headerIdx,
      dateColIndex: dateCol,
      narrationColIndex: narrCol,
      debitColIndex: debitCol,
      creditColIndex: creditCol,
      amountColIndex: amountCol,
      typeColIndex: typeCol,
      balanceColIndex: balCol,
      dateFormat: 'DD/MM/YYYY'
    };
  }
}
