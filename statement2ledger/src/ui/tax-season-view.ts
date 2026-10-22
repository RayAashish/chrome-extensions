/**
 * Statement2Ledger - Tax-Season Helper View Modal
 * 
 * Aggregates taxable interest, TDS deductions, advance tax, and high-value credits.
 */

import { formatPaiseToIndianCurrency } from '../core/money';
import { calculateTaxSeasonSummary } from '../export/json';
import { Transaction } from '../types';

export class TaxSeasonModal {
  private modalEl: HTMLElement | null = null;

  public show(transactions: Transaction[]): void {
    this.close();
    const summary = calculateTaxSeasonSummary(transactions);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="modal-card modal-large">
        <div class="modal-header">
          <div class="tax-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/>
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
              <path d="M12 6v12"/>
            </svg>
          </div>
          <h3>Tax Season Ledger Summary</h3>
        </div>

        <p class="tax-disclaimer card-inset">
          <strong>Important Disclaimer:</strong> ${summary.disclaimer}
        </p>

        <div class="tax-metrics-grid">
          <div class="metric-card">
            <span class="metric-title">Savings & FD Interest</span>
            <strong class="metric-val text-green">${formatPaiseToIndianCurrency(summary.totalInterestPaise, true)}</strong>
            <small>Report under "Income from Other Sources"</small>
          </div>

          <div class="metric-card">
            <span class="metric-title">TDS Deducted (Sec 194A)</span>
            <strong class="metric-val text-amber">${formatPaiseToIndianCurrency(summary.totalTdsPaise, true)}</strong>
            <small>Cross-check with Form 26AS / AIS</small>
          </div>

          <div class="metric-card">
            <span class="metric-title">Advance / Direct Tax Paid</span>
            <strong class="metric-val text-blue">${formatPaiseToIndianCurrency(summary.totalAdvanceTaxPaise, true)}</strong>
            <small>Challan 280 payments</small>
          </div>

          <div class="metric-card">
            <span class="metric-title">Freelance / Business Inflow</span>
            <strong class="metric-val text-purple">${formatPaiseToIndianCurrency(summary.totalFreelanceIncomePaise, true)}</strong>
            <small>Presumptive taxation (Sec 44ADA)</small>
          </div>
        </div>

        <div class="large-credits-section">
          <h4>High-Value Credits (&ge; ₹50,000):</h4>
          ${
            summary.largeCredits.length === 0
              ? '<p class="text-muted">No credits exceeding ₹50,000 detected in this statement.</p>'
              : `
              <div class="table-scroll">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Sender / Vendor</th>
                      <th>Narration</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${summary.largeCredits
                      .map(
                        (c) => `
                      <tr>
                        <td><code>${c.date}</code></td>
                        <td><strong>₹ ${c.amountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                        <td>${c.vendor}</td>
                        <td class="text-muted small">${c.rawNarration}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="btn-close-tax">Close Summary</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    const btnClose = overlay.querySelector('#btn-close-tax') as HTMLButtonElement;
    btnClose.onclick = () => this.close();
  }

  public close(): void {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}

export const defaultTaxSeasonModal = new TaxSeasonModal();
