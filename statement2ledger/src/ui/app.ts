/**
 * Statement2Ledger - Main Application Controller
 * Handles document dropping, Web Worker lifecycle, UI state, reconciliation banners,
 * and user-initiated Blob downloads.
 */

import { generateAnonymizedLayout } from '../core/layout';
import { formatPaiseToIndianCurrency, paiseToRupees } from '../core/money';
import { generateLedgerCSV } from '../export/csv';
import { generateLedgerJSON } from '../export/json';
import { generateLedgerXLSX } from '../export/xlsx';
import { i18n } from '../i18n';
import { defaultPreferencesStore } from '../storage/preferences';
import { ParseProgress, ParseResult, Transaction } from '../types';
import { defaultManualMapperModal } from './manual-mapper-modal';
import { defaultPasswordModal } from './password-modal';
import { defaultPrivacyProofMonitor } from './privacy-proof';
import { defaultReviewTable } from './review-table';
import { defaultTaxSeasonModal } from './tax-season-view';
import { defaultTipJar } from './tip-jar';

export class App {
  private worker: Worker | null = null;
  private currentResult: ParseResult | null = null;
  private isProcessing = false;
  private maskSensitiveInfo = true;

  constructor() {
    this.maskSensitiveInfo = defaultPreferencesStore.getPreferences().maskSensitiveInfo;
  }

  public init(): void {
    this.renderLayout();
    this.attachDropzone();
    this.attachHeaderActions();
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
          type: 'module'
        });
        this.setupWorkerListeners();
      } catch (err) {
        console.error('Failed to initialize dedicated worker:', err);
      }
    }
  }

  private setupWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.onmessage = async (e: MessageEvent) => {
      const { type, payload, error, fileName, isRetry } = e.data;

      if (type === 'PROGRESS') {
        this.updateProgressBar(payload as ParseProgress);
      } else if (type === 'PARSE_SUCCESS') {
        this.handleParseSuccess(payload as ParseResult);
      } else if (type === 'PARSE_ERROR') {
        this.handleParseError(error || 'Failed to parse statement.');
      } else if (type === 'PASSWORD_REQUIRED') {
        const enteredPassword = await defaultPasswordModal.prompt(fileName || 'statement.pdf', isRetry);
        if (enteredPassword) {
          this.worker?.postMessage({
            type: 'RESUME_WITH_PASSWORD',
            payload: { password: enteredPassword }
          });
        } else {
          this.handleParseError('Parsing cancelled: password not provided.');
        }
      } else if (type === 'SCANNED_PDF_DETECTED') {
        this.handleScannedPdf(payload);
      }
    };
  }

  private renderLayout(): void {
    const root = document.getElementById('app');
    if (!root) return;

    const t = i18n.t;

    root.innerHTML = `
      <header class="app-header">
        <div class="header-container">
          <div class="brand">
            <svg class="brand-icon" width="32" height="32" viewBox="0 0 100 100">
              <rect width="100" height="100" rx="20" fill="#0284c7" />
              <path d="M 50 15 L 75 25 V 50 C 75 66 50 82 50 82 C 50 82 25 66 25 50 V 25 Z" fill="#ffffff" />
              <path d="M 40 45 L 48 53 L 64 37" fill="none" stroke="#0284c7" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div>
              <h1 class="brand-title">${t.appTitle}</h1>
              <p class="brand-subtitle">100% Client-Side Indian Bank Statement Converter</p>
            </div>
          </div>

          <div class="header-actions">
            <button type="button" class="btn btn-outline" id="btn-lang-toggle">
              ${i18n.getLanguage() === 'en' ? 'हिन्दी' : 'English'}
            </button>
            <button type="button" class="btn btn-outline" id="btn-wipe-data" title="Delete all locally stored preferences">
              ${t.deleteLocalData}
            </button>
          </div>
        </div>
      </header>

      <main class="main-content">
        <!-- Hero & Privacy Assurance -->
        <section class="hero-section">
          <h2>${t.tagline}</h2>
          <div class="privacy-badges">
            <span class="badge badge-success">🔒 Zero Network Activity</span>
            <span class="badge badge-success">⚡ Fully Offline / Wi-Fi Off Capable</span>
            <span class="badge badge-success">🛡️ In-Memory Only (No Storage)</span>
          </div>
        </section>

        <!-- Dropzone Section -->
        <section class="dropzone-section" id="dropzone-area">
          <div class="dropzone-inner">
            <div class="dropzone-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <h3>${t.dropzoneTitle}</h3>
            <p class="dropzone-subtext">${t.dropzoneSubtitle}</p>

            <div class="dropzone-actions">
              <label for="file-input" class="btn btn-primary btn-large">
                ${t.browseFiles}
                <input type="file" id="file-input" multiple accept=".pdf,.csv,.txt,.xlsx,.xls" hidden />
              </label>
              <button type="button" class="btn btn-secondary btn-large" id="btn-load-sample">
                ${t.loadSample}
              </button>
            </div>
            <p class="format-hint">${t.supportedFormats}</p>
          </div>

          <!-- Progress overlay -->
          <div class="progress-overlay hidden" id="progress-container">
            <div class="progress-card">
              <h4 id="progress-status">Parsing bank statement...</h4>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progress-fill" style="width: 0%;"></div>
              </div>
              <div class="progress-details">
                <span id="progress-percent">0%</span>
                <span id="progress-pages">Page 0 of 0</span>
              </div>
              <button type="button" class="btn btn-secondary btn-small" id="btn-cancel-parse">Cancel</button>
            </div>
          </div>
        </section>

        <!-- Dynamic Results Container -->
        <div id="results-container" class="hidden">
          <!-- Reconciliation Banner -->
          <section id="recon-banner-section"></section>

          <!-- Export Toolbar -->
          <section class="export-toolbar card">
            <div class="export-left">
              <label class="toggle-control">
                <input type="checkbox" id="toggle-mask-info" ${this.maskSensitiveInfo ? 'checked' : ''} />
                <span class="toggle-slider"></span>
                <span class="toggle-label">${t.maskDataToggle}</span>
              </label>
            </div>
            <div class="export-right">
              <button type="button" class="btn btn-outline" id="btn-open-tax">
                📊 ${t.taxSeasonSummary}
              </button>
              <button type="button" class="btn btn-primary" id="btn-download-csv">
                📥 ${t.downloadCsv}
              </button>
              <button type="button" class="btn btn-success" id="btn-download-excel">
                📗 ${t.downloadExcel}
              </button>
              <button type="button" class="btn btn-outline" id="btn-download-json">
                { } ${t.downloadJson}
              </button>
              <button type="button" class="btn btn-outline" id="btn-copy-layout" title="Copy anonymized structural layout for bug reporting">
                📋 Copy Layout
              </button>
              <button type="button" class="btn btn-danger btn-outline" id="btn-clear-results">
                ${t.clearAll}
              </button>
            </div>
          </section>

          <!-- Tip Jar Spot -->
          <div id="tip-jar-target"></div>

          <!-- Interactive Review Table -->
          <section class="review-table-section card" id="review-table-container"></section>
        </div>

        <!-- Privacy Proof Panel -->
        <div id="privacy-proof-container"></div>

        <!-- FAQ Section -->
        <section class="faq-section card">
          <h3>${t.faqTitle}</h3>
          <div class="faq-accordion">
            <details class="faq-item">
              <summary><strong>Is it really 100% offline? How can I be sure?</strong></summary>
              <p>Yes. Disconnect your Wi-Fi or turn on Airplane mode right now, then drop your statement. It works completely without internet access. You can also inspect the Network tab in Developer Tools (F12) to verify that zero bytes leave your machine.</p>
            </details>
            <details class="faq-item">
              <summary><strong>Are password-protected statements supported?</strong></summary>
              <p>Yes. When you drop an encrypted PDF from HDFC, SBI, ICICI, Axis or others, the app asks for your password in a local prompt. The password is used strictly inside your browser's Web Worker and is never logged, stored, or sent anywhere.</p>
            </details>
            <details class="faq-item">
              <summary><strong>What does the Running Balance check do?</strong></summary>
              <p>Statement2Ledger mathematically audits every single row: <code>Previous Balance + Credit - Debit == Stated Balance</code> using integer paise arithmetic. If a line is missed or misread by the PDF parser, the app flags the exact row with the discrepancy.</p>
            </details>
            <details class="faq-item">
              <summary><strong>Which banks are supported?</strong></summary>
              <p>Directly optimized parsers for HDFC Bank, State Bank of India (SBI), and ICICI Bank (PDF & CSV). All other Indian banks (Axis, Kotak, PNB, Bank of Baroda, IDFC First, etc.) are handled via the Generic Table parser with auto-column detection and manual mapping wizard.</p>
            </details>
          </div>
        </section>
      </main>

      <footer class="app-footer">
        <div class="footer-container">
          <p>&copy; ${new Date().getFullYear()} Statement2Ledger. Open Source &bull; MIT Licensed &bull; No cookies, no trackers.</p>
          <div class="footer-links">
            <a href="https://github.com/statement2ledger/statement2ledger" target="_blank" rel="noopener noreferrer">GitHub Source</a>
            <span class="sep">&bull;</span>
            <span class="footer-disclaimer">Not official accounting or tax advice.</span>
          </div>
        </div>
      </footer>
    `;

    // Render privacy monitor panel
    const proofContainer = document.getElementById('privacy-proof-container');
    if (proofContainer) {
      proofContainer.appendChild(defaultPrivacyProofMonitor.renderPrivacyProofPanel());
    }
  }

  private attachDropzone(): void {
    const dropzone = document.getElementById('dropzone-area');
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const btnSample = document.getElementById('btn-load-sample') as HTMLButtonElement;

    if (!dropzone || !fileInput) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.processFiles(Array.from(files));
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.processFiles(Array.from(fileInput.files));
      }
    });

    if (btnSample) {
      btnSample.onclick = () => this.loadSyntheticSampleData();
    }
  }

  private attachHeaderActions(): void {
    const btnLang = document.getElementById('btn-lang-toggle');
    if (btnLang) {
      btnLang.onclick = () => {
        const next = i18n.getLanguage() === 'en' ? 'hi' : 'en';
        i18n.setLanguage(next);
        this.init();
      };
    }

    const btnWipe = document.getElementById('btn-wipe-data');
    if (btnWipe) {
      btnWipe.onclick = () => {
        const confirmWipe = confirm('Are you sure you want to delete all saved categorization rules and preferences?');
        if (confirmWipe) {
          defaultPreferencesStore.deleteAllLocalData();
          alert('All local preferences have been wiped.');
        }
      };
    }
  }

  private async processFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.showProgress(true);
    defaultPrivacyProofMonitor.startMonitoringAfterFileLoad();

    const mergedTransactions: Transaction[] = [];
    const mergedUnparsed: any[] = [];
    let primaryMetadata: any = null;
    let singleFileResult: ParseResult | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const result = await this.parseSingleFile(buffer, file.name, file.type);
        if (files.length === 1) {
          singleFileResult = result;
        }
        if (!primaryMetadata) primaryMetadata = result.metadata;

        for (const tx of result.transactions) {
          // Duplicate detection ONLY across different source files
          const isDuplicate = mergedTransactions.some(
            (existing) =>
              existing.sourceFile !== tx.sourceFile &&
              existing.date === tx.date &&
              existing.signedAmountPaise === tx.signedAmountPaise &&
              (existing.reference === tx.reference || existing.rawNarration === tx.rawNarration)
          );
          if (!isDuplicate) {
            mergedTransactions.push(tx);
          }
        }
        mergedUnparsed.push(...result.unparsedLines);
      } catch (err: any) {
        alert(`Error parsing ${file.name}: ${err.message || err}`);
      }
    }

    this.showProgress(false);

    if (files.length === 1 && singleFileResult && singleFileResult.transactions.length > 0) {
      // Single file upload: preserve verified chronological sequence and reconciliation
      this.currentResult = singleFileResult;
      this.renderResults();
      return;
    }

    if (mergedTransactions.length > 0) {
      // Re-reconcile merged result across multiple files
      const { reconcileTransactions } = await import('../core/reconcile');
      const recon = reconcileTransactions(mergedTransactions, primaryMetadata, mergedUnparsed);

      this.currentResult = {
        transactions: recon.transactions,
        unparsedLines: mergedUnparsed,
        metadata: primaryMetadata,
        reconciliation: recon.report
      };

      this.renderResults();
    } else {
      alert(`No transactions could be extracted from the uploaded document (${mergedUnparsed.length} unparsed lines found).\n\nIf this PDF contains scanned image pages or a non-standard layout, please check the unparsed lines or use the Manual Column Mapper.`);
    }
  }

  private parseSingleFile(buffer: ArrayBuffer, fileName: string, fileType: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Web Worker unavailable'));
        return;
      }

      const handler = (e: MessageEvent) => {
        const { type, payload, error } = e.data;
        if (type === 'PARSE_SUCCESS') {
          this.worker?.removeEventListener('message', handler);
          resolve(payload);
        } else if (type === 'PARSE_ERROR') {
          this.worker?.removeEventListener('message', handler);
          reject(new Error(error));
        }
      };

      const workerSrc = new URL('pdf.worker.min.mjs', window.location.href).href;
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({
        type: 'PARSE_FILE',
        payload: { fileData: buffer, fileName, fileType, workerSrc }
      });
    });
  }

  private handleParseSuccess(result: ParseResult): void {
    this.showProgress(false);
    this.currentResult = result;
    this.renderResults();
  }

  private handleParseError(msg: string): void {
    this.showProgress(false);
    alert(`Document Parsing Notice: ${msg}`);
  }

  private handleScannedPdf(payload: any): void {
    this.showProgress(false);
    alert(
      `Scanned Statement Detected (${payload.numPages} pages).\n\nThis PDF consists of scanned raster images rather than digital text. Local client-side OCR requires ~30MB download and is on our roadmap.`
    );
  }

  private updateProgressBar(progress: ParseProgress): void {
    const fill = document.getElementById('progress-fill');
    const status = document.getElementById('progress-status');
    const percent = document.getElementById('progress-percent');
    const pages = document.getElementById('progress-pages');

    if (fill) fill.style.width = `${progress.percentage}%`;
    if (status) status.textContent = progress.statusMessage;
    if (percent) percent.textContent = `${progress.percentage}%`;
    if (pages && progress.pageTotal > 0) {
      pages.textContent = `Page ${progress.pageCurrent} of ${progress.pageTotal}`;
    }
  }

  private showProgress(show: boolean): void {
    const el = document.getElementById('progress-container');
    if (el) {
      if (show) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  private renderResults(): void {
    if (!this.currentResult) return;

    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    this.renderReconciliationBanner();
    this.renderReviewTable();
    this.attachExportToolbarActions();

    // Scroll to results
    resultsContainer?.scrollIntoView({ behavior: 'smooth' });
  }

  private renderReconciliationBanner(): void {
    const bannerEl = document.getElementById('recon-banner-section');
    if (!bannerEl || !this.currentResult) return;

    const recon = this.currentResult.reconciliation;
    const isSuccess = recon.isFullyReconciled;

    bannerEl.innerHTML = `
      <div class="recon-banner ${isSuccess ? 'recon-success' : 'recon-warning'} card">
        <div class="recon-main-row">
          <div class="recon-status">
            <span class="recon-icon">${isSuccess ? '✅' : '⚠️'}</span>
            <div>
              <h3>${isSuccess ? 'Mathematical Reconciliation Passed' : 'Balance Discrepancy Flagged'}</h3>
              <p>${
                isSuccess
                  ? `All ${recon.totalRows} transactions matched running balance: opening balance + credits - debits = closing balance.`
                  : recon.firstBreakingRowReason || 'Discrepancy detected in one or more statement rows.'
              }</p>
            </div>
          </div>

          <div class="recon-stats-pills">
            <div class="stat-pill">
              <span class="label">Total Spent (Dr)</span>
              <strong class="val text-red">${formatPaiseToIndianCurrency(recon.totalDebitsPaise, true)}</strong>
            </div>
            <div class="stat-pill">
              <span class="label">Total Income (Cr)</span>
              <strong class="val text-green">${formatPaiseToIndianCurrency(recon.totalCreditsPaise, true)}</strong>
            </div>
            <div class="stat-pill">
              <span class="label">Net Cashflow</span>
              <strong class="val font-mono">${formatPaiseToIndianCurrency(recon.netDifferencePaise, true)}</strong>
            </div>
            <div class="stat-pill">
              <span class="label">Verified Rows</span>
              <strong class="val">${recon.verifiedRows} / ${recon.totalRows}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderReviewTable(): void {
    const tableContainer = document.getElementById('review-table-container');
    if (tableContainer && this.currentResult) {
      defaultReviewTable.init(tableContainer, this.currentResult.transactions, () => {
        this.renderReconciliationBanner();
      });
    }
  }

  private attachExportToolbarActions(): void {
    const toggleMask = document.getElementById('toggle-mask-info') as HTMLInputElement;
    if (toggleMask) {
      toggleMask.onchange = () => {
        this.maskSensitiveInfo = toggleMask.checked;
        defaultPreferencesStore.setMaskSensitiveInfo(this.maskSensitiveInfo);
      };
    }

    const btnCsv = document.getElementById('btn-download-csv');
    if (btnCsv) {
      btnCsv.onclick = () => {
        if (!this.currentResult) return;
        const blob = generateLedgerCSV(this.currentResult.transactions, {
          maskSensitiveInfo: this.maskSensitiveInfo
        });
        this.downloadBlob(blob, `ledger-${this.currentResult.metadata.bankName.toLowerCase().replace(/\s+/g, '-')}.csv`);
        this.triggerTipJar();
      };
    }

    const btnExcel = document.getElementById('btn-download-excel');
    if (btnExcel) {
      btnExcel.onclick = () => {
        if (!this.currentResult) return;
        const blob = generateLedgerXLSX(this.currentResult, this.maskSensitiveInfo);
        this.downloadBlob(blob, `ledger-${this.currentResult.metadata.bankName.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
        this.triggerTipJar();
      };
    }

    const btnJson = document.getElementById('btn-download-json');
    if (btnJson) {
      btnJson.onclick = () => {
        if (!this.currentResult) return;
        const blob = generateLedgerJSON(this.currentResult, this.maskSensitiveInfo);
        this.downloadBlob(blob, `ledger-${this.currentResult.metadata.bankName.toLowerCase().replace(/\s+/g, '-')}.json`);
        this.triggerTipJar();
      };
    }

    const btnTax = document.getElementById('btn-open-tax');
    if (btnTax) {
      btnTax.onclick = () => {
        if (this.currentResult) {
          defaultTaxSeasonModal.show(this.currentResult.transactions);
        }
      };
    }

    const btnCopyLayout = document.getElementById('btn-copy-layout');
    if (btnCopyLayout) {
      btnCopyLayout.onclick = () => {
        if (!this.currentResult) return;
        // Generate anonymized layout from transactions
        const dummyClusters = this.currentResult.transactions.map((tx, idx) => ({
          y: 700 - idx * 15,
          items: [
            { str: tx.date, x: 50, y: 700 - idx * 15, width: 40, height: 10 },
            { str: tx.rawNarration, x: 120, y: 700 - idx * 15, width: 180, height: 10 },
            { str: tx.signedAmountPaise.toString(), x: 350, y: 700 - idx * 15, width: 60, height: 10 },
            { str: tx.balancePaise.toString(), x: 450, y: 700 - idx * 15, width: 60, height: 10 }
          ],
          fullText: `${tx.date} ${tx.rawNarration} ${tx.signedAmountPaise} ${tx.balancePaise}`,
          pageNumber: 1
        }));

        const skeleton = generateAnonymizedLayout(dummyClusters);
        navigator.clipboard.writeText(skeleton).then(() => {
          alert('Anonymized layout skeleton copied to clipboard! You can paste it into a GitHub issue safely.');
        });
      };
    }

    const btnClear = document.getElementById('btn-clear-results');
    if (btnClear) {
      btnClear.onclick = () => {
        this.currentResult = null;
        const container = document.getElementById('results-container');
        if (container) container.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  }

  private triggerTipJar(): void {
    const target = document.getElementById('tip-jar-target');
    if (target) {
      defaultTipJar.render(target);
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  public loadSyntheticSampleData(): void {
    defaultPrivacyProofMonitor.startMonitoringAfterFileLoad();

    // High quality synthetic Indian bank statement dataset
    const sampleTxs: Transaction[] = [
      {
        id: 'sample-1',
        date: '2026-10-01',
        valueDate: '2026-10-01',
        description: 'SALARY: Employer Salary',
        rawNarration: 'SALARY CREDIT - OCT 2026 - INFOSYS LTD',
        mode: 'SALARY',
        vendor: 'Infosys',
        reference: 'CMS982341234',
        debitPaise: 0,
        creditPaise: 18500000,
        signedAmountPaise: 18500000,
        balancePaise: 23500000,
        category: 'Salary/Income',
        subcategory: 'Monthly Salary',
        tags: ['Income', 'Salary'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-2',
        date: '2026-10-02',
        valueDate: '2026-10-02',
        description: 'UPI: Swiggy',
        rawNarration: 'UPI-SWIGGY-BENGALURU-982347923-HDFC0001',
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
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-3',
        date: '2026-10-04',
        valueDate: '2026-10-04',
        description: 'UPI: Uber',
        rawNarration: 'UPI/428910293812/UBER INDIA/uber.india@icici/RIDE',
        mode: 'UPI',
        vendor: 'Uber',
        reference: '428910293812',
        debitPaise: 38000,
        creditPaise: 0,
        signedAmountPaise: -38000,
        balancePaise: 23417000,
        category: 'Transport',
        subcategory: 'Cab & Auto',
        tags: ['UPI', 'Uber'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.92,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-4',
        date: '2026-10-06',
        valueDate: '2026-10-06',
        description: 'POS: Amazon',
        rawNarration: 'POS 4XXXXXXXXXXX1234 AMAZON PAY BANGALORE IN',
        mode: 'POS',
        vendor: 'Amazon',
        reference: '1234',
        debitPaise: 249900,
        creditPaise: 0,
        signedAmountPaise: -249900,
        balancePaise: 23167100,
        category: 'Shopping',
        subcategory: 'E-Commerce',
        tags: ['POS', 'Amazon'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.92,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-5',
        date: '2026-10-10',
        valueDate: '2026-10-10',
        description: 'ACH: HDFC Bank Loan EMI',
        rawNarration: 'ACH D- HDFC0000123- HDFC BANK HOME LOAN EMI',
        mode: 'ACH',
        vendor: 'HDFC Bank',
        reference: 'ACH9021',
        debitPaise: 4250000,
        creditPaise: 0,
        signedAmountPaise: -4250000,
        balancePaise: 18917100,
        category: 'EMI & Loans',
        subcategory: 'Home Loan EMI',
        tags: ['ACH', 'Mandate'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.92,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-6',
        date: '2026-10-14',
        valueDate: '2026-10-14',
        description: 'NEFT: Upwork Escrow',
        rawNarration: 'NEFT CR-CITI0000001-UPWORK ESCROW INC-OCT INVOICE',
        mode: 'NEFT',
        vendor: 'Upwork',
        reference: 'CITIN9812401',
        debitPaise: 0,
        creditPaise: 12000000,
        signedAmountPaise: 12000000,
        balancePaise: 30917100,
        category: 'Freelance Income',
        subcategory: 'Platform Payout',
        tags: ['NEFT', 'Upwork', 'Business'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: true,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-7',
        date: '2026-10-18',
        valueDate: '2026-10-18',
        description: 'INTEREST: Bank Interest',
        rawNarration: 'INT.PD: 01-07-2026 TO 30-09-2026 SB INTEREST CREDIT',
        mode: 'INTEREST',
        vendor: 'HDFC Bank',
        reference: '',
        debitPaise: 0,
        creditPaise: 345000,
        signedAmountPaise: 345000,
        balancePaise: 31262100,
        category: 'Interest',
        subcategory: 'Savings Bank Interest',
        tags: ['INTEREST', 'Income', 'Taxable'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      },
      {
        id: 'sample-8',
        date: '2026-10-18',
        valueDate: '2026-10-18',
        description: 'TDS: Income Tax Department',
        rawNarration: 'TDS DEDUCTION ON SB INTEREST UNDER SEC 194A',
        mode: 'TDS',
        vendor: 'Income Tax Department',
        reference: '',
        debitPaise: 34500,
        creditPaise: 0,
        signedAmountPaise: -34500,
        balancePaise: 31227600,
        category: 'Taxes',
        subcategory: 'TDS',
        tags: ['TDS', 'TaxSeason'],
        sourceFile: 'hdfc_oct_sample.pdf',
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false,
        verificationStatus: 'verified'
      }
    ];

    this.currentResult = {
      transactions: sampleTxs,
      unparsedLines: [],
      metadata: {
        bankName: 'HDFC Bank',
        accountNumberMasked: 'XXXX4321',
        customerNameMasked: 'Aashish Kumar Ray',
        currency: 'INR',
        sourceFormat: 'PDF',
        openingBalancePaise: 5000000,
        closingBalancePaise: 31227600
      },
      reconciliation: {
        totalRows: sampleTxs.length,
        verifiedRows: sampleTxs.length,
        failingRows: 0,
        unverifiedRows: 0,
        isFullyReconciled: true,
        openingBalancePaise: 5000000,
        closingBalancePaise: 31227600,
        calculatedClosingBalancePaise: 31227600,
        totalDebitsPaise: 4572400,
        totalCreditsPaise: 30845000,
        netDifferencePaise: 26272600,
        firstBreakingRowIndex: null,
        unparsedLinesCount: 0,
        totalCandidateLines: sampleTxs.length
      }
    };

    this.renderResults();
  }
}
