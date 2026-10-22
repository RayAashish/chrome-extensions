/**
 * Statement2Ledger - Dedicated Web Worker for Document Parsing
 * 
 * Executes PDF and spreadsheet parsing off the main UI thread.
 * Streams real-time progress per page and provides cancellation & password handling.
 */

import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import { parseCSV } from '../core/csv-parser';
import { assignRowItemsToColumns, clusterTextItemsIntoRows, detectColumnBoundsFromHeader, isHeaderRow, isNoiseOrSummaryRow, partitionClusterItemsIntoCells } from '../core/layout';
import { reconcileTransactions } from '../core/reconcile';
import { defaultParserRegistry } from '../parsers';
import { ManualColumnMapping, ParseProgress, ParseResult, PdfRowCluster, PdfTextItem, StatementMetadata, Transaction, UnparsedLine } from '../types';

// Configure pdfjs worker to self-hosted local worker in public directory
if (typeof self !== 'undefined') {
  try {
    const origin = self.location?.origin || '';
    if (origin && !origin.startsWith('null') && !origin.startsWith('blob')) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', origin + '/').href;
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
}

interface WorkerMessageEvent {
  type: 'PARSE_FILE' | 'RESUME_WITH_PASSWORD' | 'CANCEL';
  payload?: {
    fileData: ArrayBuffer;
    fileName: string;
    fileType: string;
    password?: string;
    manualMapping?: ManualColumnMapping;
    workerSrc?: string;
  };
}

let pendingPasswordResolve: ((password: string) => void) | null = null;
let isCancelled = false;

self.onmessage = async (e: MessageEvent<WorkerMessageEvent>) => {
  const { type, payload } = e.data;

  if (type === 'CANCEL') {
    isCancelled = true;
    return;
  }

  if (type === 'RESUME_WITH_PASSWORD') {
    if (pendingPasswordResolve && payload?.password) {
      pendingPasswordResolve(payload.password);
      pendingPasswordResolve = null;
    }
    return;
  }

  if (type === 'PARSE_FILE' && payload) {
    isCancelled = false;
    if (payload.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = payload.workerSrc;
    }
    try {
      const result = await processFile(payload.fileData, payload.fileName, payload.fileType, payload.password, payload.manualMapping);
      self.postMessage({ type: 'PARSE_SUCCESS', payload: result });
    } catch (err: any) {
      if (err.name === 'PasswordException' || err.message?.includes('password') || err.code === 1) {
        self.postMessage({ type: 'PASSWORD_REQUIRED', fileName: payload.fileName });
      } else {
        self.postMessage({ type: 'PARSE_ERROR', error: err.message || 'Unknown parsing failure' });
      }
    }
  }
};

function reportProgress(progress: ParseProgress): void {
  self.postMessage({ type: 'PROGRESS', payload: progress });
}

async function processFile(
  buffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  initialPassword?: string,
  manualMapping?: ManualColumnMapping
): Promise<ParseResult> {
  const isPdf = fileName.toLowerCase().endsWith('.pdf') || fileType.includes('pdf');
  const isExcel = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');

  if (isPdf) {
    return parsePdfFile(buffer, fileName, initialPassword, manualMapping);
  } else if (isExcel) {
    return parseExcelFile(buffer, fileName, manualMapping);
  } else {
    // CSV / TXT
    return parseCsvFile(buffer, fileName, manualMapping);
  }
}

async function parsePdfFile(
  buffer: ArrayBuffer,
  fileName: string,
  password?: string,
  manualMapping?: ManualColumnMapping
): Promise<ParseResult> {
  reportProgress({
    stage: 'reading',
    pageCurrent: 0,
    pageTotal: 0,
    percentage: 5,
    statusMessage: 'Loading PDF document...'
  });

  let currentPassword = password;
  let pdfDoc: pdfjsLib.PDFDocumentProxy;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password: currentPassword,
      cMapUrl: './cmaps/',
      cMapPacked: true
    });

    loadingTask.onPassword = (callback: (pwd: string) => void, reason: number) => {
      // Reason 1: NEED_PASSWORD, Reason 2: INCORRECT_PASSWORD
      self.postMessage({
        type: 'PASSWORD_REQUIRED',
        fileName,
        isRetry: reason === 2
      });

      pendingPasswordResolve = (enteredPassword: string) => {
        callback(enteredPassword);
      };
    };

    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    throw err;
  }

  const numPages = pdfDoc.numPages;
  const allRowClusters: PdfRowCluster[] = [];
  let totalCharacters = 0;
  const fullTextLines: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (isCancelled) {
      throw new Error('Parsing cancelled by user');
    }

    reportProgress({
      stage: 'extracting',
      pageCurrent: pageNum,
      pageTotal: numPages,
      percentage: Math.round(10 + (pageNum / numPages) * 60),
      statusMessage: `Extracting page ${pageNum} of ${numPages}...`
    });

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        totalCharacters += item.str.length;
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
          height: item.height || 0,
          fontName: item.fontName
        });
      }
    }

    const clusters = clusterTextItemsIntoRows(items, pageNum);
    for (const c of clusters) {
      allRowClusters.push(c);
      fullTextLines.push(c.fullText);
    }

    // Memory cleanup: release page canvas and geometry
    page.cleanup();
  }

  // Detect scanned/image PDF (no text layer)
  if (totalCharacters < 40 && numPages > 0) {
    self.postMessage({
      type: 'SCANNED_PDF_DETECTED',
      payload: { fileName, numPages }
    });
    throw new Error('This PDF appears to be a scanned image with no extractable text layer.');
  }

  reportProgress({
    stage: 'parsing',
    pageCurrent: numPages,
    pageTotal: numPages,
    percentage: 75,
    statusMessage: 'Detecting bank statement layout and columns...'
  });

  const fullSampleText = fullTextLines.slice(0, 50).join('\n');
  const { parser } = defaultParserRegistry.findBestParser(fullSampleText, { filename: fileName });
  const metadata = parser.extractMetadata(fullSampleText);

  // Convert clusters to tabular rows using column boundary analysis
  const tableRows = extractTableRowsFromClusters(allRowClusters);

  let parsedData = await parser.parse(
    {
      rawText: fullTextLines.join('\n'),
      rows: tableRows,
      clusters: allRowClusters
    },
    metadata,
    { sourceFileName: fileName, manualMapping }
  );

  // CRITICAL FAIL-SAFE:
  // If the detected bank parser returned 0 transactions from a multi-page document,
  // automatically fallback to GenericParser with both rows and raw text
  if (parsedData.transactions.length === 0) {
    const genericParser = defaultParserRegistry.getParser('generic');
    if (genericParser && genericParser !== parser) {
      const fallbackResult = await genericParser.parse(
        {
          rawText: fullTextLines.join('\n'),
          rows: tableRows,
          clusters: allRowClusters
        },
        metadata,
        { sourceFileName: fileName, manualMapping }
      );
      if (fallbackResult.transactions.length > 0) {
        parsedData = fallbackResult;
      }
    }
  }

  reportProgress({
    stage: 'reconciling',
    pageCurrent: numPages,
    pageTotal: numPages,
    percentage: 92,
    statusMessage: 'Running mathematical balance reconciliation...'
  });

  const reconciled = reconcileTransactions(parsedData.transactions, metadata, parsedData.unparsedLines);

  reportProgress({
    stage: 'completed',
    pageCurrent: numPages,
    pageTotal: numPages,
    percentage: 100,
    statusMessage: 'Completed successfully.'
  });

  return {
    transactions: reconciled.transactions,
    unparsedLines: parsedData.unparsedLines,
    metadata,
    reconciliation: reconciled.report
  };
}

function extractTableRowsFromClusters(clusters: PdfRowCluster[]): string[][] {
  const rows: string[][] = [];
  let activeBounds: any[] = [];

  for (const cluster of clusters) {
    if (isNoiseOrSummaryRow(cluster.fullText)) continue;

    if (isHeaderRow(cluster.fullText)) {
      const bounds = detectColumnBoundsFromHeader(cluster);
      if (bounds.length >= 3) {
        activeBounds = bounds;
        rows.push(activeBounds.map((b) => b.name));
        continue;
      }
    }

    if (activeBounds.length >= 3) {
      const colCells = assignRowItemsToColumns(cluster, activeBounds);
      const rowArr = activeBounds.map((b) => colCells[b.name] || '');

      // Verification: if rowArr collapsed into 1 cell or empty while cluster has >= 3 items,
      // fallback to positional horizontal gap partitioning
      const nonEmpty = rowArr.filter((c) => c.trim().length > 0);
      if (nonEmpty.length <= 1 && cluster.items.length >= 3) {
        const partitioned = partitionClusterItemsIntoCells(cluster);
        if (partitioned.length > nonEmpty.length) {
          rows.push(partitioned);
          continue;
        }
      }
      rows.push(rowArr);
    } else {
      // Split items using horizontal gap partitioning
      rows.push(partitionClusterItemsIntoCells(cluster));
    }
  }

  return rows;
}

async function parseExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  manualMapping?: ManualColumnMapping
): Promise<ParseResult> {
  reportProgress({
    stage: 'reading',
    pageCurrent: 1,
    pageTotal: 1,
    percentage: 20,
    statusMessage: 'Reading Excel workbook...'
  });

  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  const sampleText = rawRows.slice(0, 30).map((r) => r.join(' ')).join('\n');
  const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: fileName });
  const metadata = parser.extractMetadata(sampleText, rawRows);

  const parsedData = await parser.parse({ rows: rawRows }, metadata, { sourceFileName: fileName, manualMapping });
  const reconciled = reconcileTransactions(parsedData.transactions, metadata, parsedData.unparsedLines);

  return {
    transactions: reconciled.transactions,
    unparsedLines: parsedData.unparsedLines,
    metadata,
    reconciliation: reconciled.report
  };
}

async function parseCsvFile(
  buffer: ArrayBuffer,
  fileName: string,
  manualMapping?: ManualColumnMapping
): Promise<ParseResult> {
  reportProgress({
    stage: 'reading',
    pageCurrent: 1,
    pageTotal: 1,
    percentage: 30,
    statusMessage: 'Parsing CSV data...'
  });

  const decoder = new TextDecoder('utf-8');
  let text = decoder.decode(buffer);

  // Fallback to windows-1252 if garbled
  if (text.includes('\uFFFD')) {
    try {
      const winDecoder = new TextDecoder('windows-1252');
      text = winDecoder.decode(buffer);
    } catch {
      // Keep utf-8
    }
  }

  const rows = parseCSV(text);
  const sampleText = rows.slice(0, 30).map((r) => r.join(' ')).join('\n');
  const { parser } = defaultParserRegistry.findBestParser(sampleText, { filename: fileName });
  const metadata = parser.extractMetadata(sampleText, rows);

  const parsedData = await parser.parse({ rows }, metadata, { sourceFileName: fileName, manualMapping });
  const reconciled = reconcileTransactions(parsedData.transactions, metadata, parsedData.unparsedLines);

  return {
    transactions: reconciled.transactions,
    unparsedLines: parsedData.unparsedLines,
    metadata,
    reconciliation: reconciled.report
  };
}
