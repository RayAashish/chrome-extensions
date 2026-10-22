/**
 * Statement2Ledger - Interactive Ledger Review Table
 * 
 * Features:
 * - Real-time full-text search across vendor, narration, reference, and amounts
 * - Quick filters (All, Needs Review, Credits > ₹50k, Business, Mismatches)
 * - In-place category changer with "Apply to all from this vendor" memory
 * - Business vs Personal tagging
 * - Confidence badges & mathematical verification status
 */

import { defaultCategorizationEngine } from '../core/categorize';
import { formatPaiseToIndianCurrency } from '../core/money';
import { defaultPreferencesStore } from '../storage/preferences';
import { Transaction } from '../types';

export class ReviewTableComponent {
  private transactions: Transaction[] = [];
  private filteredTransactions: Transaction[] = [];
  private currentFilter: 'all' | 'needsReview' | 'largeCredits' | 'business' | 'failed' = 'all';
  private searchQuery = '';
  private containerEl: HTMLElement | null = null;
  private onUpdateCallback?: () => void;

  public init(container: HTMLElement, transactions: Transaction[], onUpdate?: () => void): void {
    this.containerEl = container;
    this.transactions = transactions;
    this.onUpdateCallback = onUpdate;
    this.applyFilters();
    this.render();
  }

  public setTransactions(transactions: Transaction[]): void {
    this.transactions = transactions;
    this.applyFilters();
    this.render();
  }

  private applyFilters(): void {
    const q = this.searchQuery.toLowerCase().trim();

    this.filteredTransactions = this.transactions.filter((tx) => {
      // 1. Text Search Filter
      if (q) {
        const matchNarr = tx.rawNarration.toLowerCase().includes(q);
        const matchVendor = tx.vendor.toLowerCase().includes(q);
        const matchRef = tx.reference.toLowerCase().includes(q);
        const matchCat = tx.category.toLowerCase().includes(q);
        const matchAmt = (tx.signedAmountPaise / 100).toString().includes(q);
        if (!matchNarr && !matchVendor && !matchRef && !matchCat && !matchAmt) {
          return false;
        }
      }

      // 2. Button Quick Filter
      switch (this.currentFilter) {
        case 'needsReview':
          return tx.needsReview;
        case 'largeCredits':
          return tx.creditPaise >= 5000000;
        case 'business':
          return !!tx.isBusiness;
        case 'failed':
          return tx.verificationStatus === 'failed';
        default:
          return true;
      }
    });
  }

  public render(): void {
    if (!this.containerEl) return;

    const categories = defaultCategorizationEngine.getAllCategories();
    const needsReviewCount = this.transactions.filter((t) => t.needsReview).length;
    const failingCount = this.transactions.filter((t) => t.verificationStatus === 'failed').length;
    const largeCreditsCount = this.transactions.filter((t) => t.creditPaise >= 5000000).length;
    const businessCount = this.transactions.filter((t) => t.isBusiness).length;

    this.containerEl.innerHTML = `
      <div class="table-toolbar">
        <div class="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            id="table-search-input"
            class="search-input"
            placeholder="Search vendor, narration, amount..."
            value="${this.escapeHtml(this.searchQuery)}"
          />
        </div>

        <div class="filter-pills">
          <button type="button" class="pill-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">
            All (${this.transactions.length})
          </button>
          <button type="button" class="pill-btn ${this.currentFilter === 'needsReview' ? 'active' : ''}" data-filter="needsReview">
            Needs Review (${needsReviewCount})
          </button>
          <button type="button" class="pill-btn ${this.currentFilter === 'largeCredits' ? 'active' : ''}" data-filter="largeCredits">
            Credits &ge; ₹50k (${largeCreditsCount})
          </button>
          <button type="button" class="pill-btn ${this.currentFilter === 'business' ? 'active' : ''}" data-filter="business">
            Business (${businessCount})
          </button>
          ${
            failingCount > 0
              ? `
            <button type="button" class="pill-btn pill-btn-danger ${this.currentFilter === 'failed' ? 'active' : ''}" data-filter="failed">
              ⚠️ Balance Mismatch (${failingCount})
            </button>
          `
              : ''
          }
        </div>
      </div>

      <div class="table-scroll review-table-scroll">
        <table class="data-table" id="main-ledger-table">
          <thead>
            <tr>
              <th style="width: 105px;">Date</th>
              <th style="min-width: 160px;">Vendor & Mode</th>
              <th style="min-width: 240px;">Narration</th>
              <th style="min-width: 170px;">Category</th>
              <th style="width: 110px; text-align: right;">Debit</th>
              <th style="width: 110px; text-align: right;">Credit</th>
              <th style="width: 120px; text-align: right;">Balance</th>
              <th style="width: 80px; text-align: center;">Audit</th>
            </tr>
          </thead>
          <tbody>
            ${
              this.filteredTransactions.length === 0
                ? `<tr><td colspan="8" class="text-center py-4 text-muted">No transactions matching your filter.</td></tr>`
                : this.filteredTransactions
                    .map((tx, idx) => {
                      const isFailing = tx.verificationStatus === 'failed';
                      const rowClass = isFailing ? 'row-failing' : tx.needsReview ? 'row-review' : '';
                      return `
                    <tr class="${rowClass}" data-tx-id="${tx.id}">
                      <td><code>${tx.date}</code></td>
                      <td>
                        <div class="vendor-cell">
                          <strong class="vendor-name">${this.escapeHtml(tx.vendor)}</strong>
                          <span class="mode-tag">${tx.mode}</span>
                          ${tx.isBusiness ? '<span class="biz-tag">Biz</span>' : ''}
                        </div>
                      </td>
                      <td class="narration-cell">
                        <div class="narration-text" title="${this.escapeHtml(tx.rawNarration)}">
                          ${this.escapeHtml(tx.rawNarration)}
                        </div>
                        ${tx.reference ? `<div class="ref-subtext">Ref: ${this.escapeHtml(tx.reference)}</div>` : ''}
                      </td>
                      <td>
                        <select class="category-select" data-tx-idx="${idx}">
                          ${categories
                            .map(
                              (c) =>
                                `<option value="${c.name}" ${c.name === tx.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`
                            )
                            .join('')}
                        </select>
                      </td>
                      <td class="text-right text-red">
                        ${tx.debitPaise > 0 ? formatPaiseToIndianCurrency(tx.debitPaise) : '-'}
                      </td>
                      <td class="text-right text-green">
                        ${tx.creditPaise > 0 ? formatPaiseToIndianCurrency(tx.creditPaise) : '-'}
                      </td>
                      <td class="text-right font-mono">
                        ${formatPaiseToIndianCurrency(tx.balancePaise)}
                      </td>
                      <td class="text-center">
                        ${
                          isFailing
                            ? `<span class="badge badge-danger" title="Discrepancy: ₹${(tx.balanceDiscrepancyPaise || 0) / 100}">Mismatch</span>`
                            : tx.needsReview
                            ? `<span class="badge badge-warning" title="${tx.reviewReasons.join(', ')}">Review</span>`
                            : `<span class="badge badge-success">✓ Verified</span>`
                        }
                      </td>
                    </tr>
                  `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    if (!this.containerEl) return;

    // Search input
    const searchInput = this.containerEl.querySelector('#table-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.oninput = () => {
        this.searchQuery = searchInput.value;
        this.applyFilters();
        this.render();
        // Restore focus to input
        const updatedInput = this.containerEl?.querySelector('#table-search-input') as HTMLInputElement;
        if (updatedInput) {
          updatedInput.focus();
          updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
        }
      };
    }

    // Filter pills
    const filterButtons = this.containerEl.querySelectorAll<HTMLButtonElement>('.pill-btn');
    filterButtons.forEach((btn) => {
      btn.onclick = () => {
        const filterVal = btn.getAttribute('data-filter') as any;
        this.currentFilter = filterVal;
        this.applyFilters();
        this.render();
      };
    });

    // Category select changes
    const selects = this.containerEl.querySelectorAll<HTMLSelectElement>('.category-select');
    selects.forEach((sel) => {
      sel.onchange = () => {
        const idx = parseInt(sel.getAttribute('data-tx-idx') || '0', 10);
        const tx = this.filteredTransactions[idx];
        if (!tx) return;

        const newCategory = sel.value;
        tx.category = newCategory;
        tx.needsReview = false;

        // Prompt user to apply to all from this vendor
        if (tx.vendor && tx.vendor !== 'Unknown') {
          const applyAll = confirm(
            `Apply category "${newCategory}" to all transactions from "${tx.vendor}" and remember for future statements?`
          );
          if (applyAll) {
            defaultPreferencesStore.setVendorRule(tx.vendor, newCategory, tx.subcategory, tx.isBusiness);
            // Update all matching in current list
            for (const item of this.transactions) {
              if (item.vendor.toUpperCase() === tx.vendor.toUpperCase()) {
                item.category = newCategory;
                item.needsReview = false;
              }
            }
          }
        }

        if (this.onUpdateCallback) this.onUpdateCallback();
        this.applyFilters();
        this.render();
      };
    });
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const defaultReviewTable = new ReviewTableComponent();
