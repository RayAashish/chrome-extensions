/**
 * Statement2Ledger - Manual Column Mapping Wizard
 * Fallback tool for unstandardized or unknown bank layouts.
 */

import { ManualColumnMapping } from '../types';

export class ManualMapperModal {
  private modalEl: HTMLElement | null = null;
  private resolveFn: ((mapping: ManualColumnMapping | null) => void) | null = null;

  public prompt(rows: string[][], defaultMapping?: ManualColumnMapping): Promise<ManualColumnMapping | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.render(rows, defaultMapping);
    });
  }

  private render(rows: string[][], defaultMapping?: ManualColumnMapping): void {
    this.close();

    const sampleRows = rows.slice(0, 8);
    const numCols = Math.max(...sampleRows.map((r) => r.length), 6);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="modal-card modal-large">
        <div class="modal-header">
          <h3>Map Columns Manually</h3>
          <p>Assign each column to its matching financial field. You can preview the extracted rows below.</p>
        </div>

        <div class="mapper-controls-grid">
          <div class="form-group">
            <label for="map-date-col">Date Column *</label>
            <select id="map-date-col" class="form-control">
              ${this.renderColumnOptions(numCols, defaultMapping?.dateColIndex ?? 0)}
            </select>
          </div>

          <div class="form-group">
            <label for="map-narr-col">Narration / Description *</label>
            <select id="map-narr-col" class="form-control">
              ${this.renderColumnOptions(numCols, defaultMapping?.narrationColIndex ?? 1)}
            </select>
          </div>

          <div class="form-group">
            <label for="map-debit-col">Withdrawal / Debit</label>
            <select id="map-debit-col" class="form-control">
              <option value="-1">-- None --</option>
              ${this.renderColumnOptions(numCols, defaultMapping?.debitColIndex ?? 4)}
            </select>
          </div>

          <div class="form-group">
            <label for="map-credit-col">Deposit / Credit</label>
            <select id="map-credit-col" class="form-control">
              <option value="-1">-- None --</option>
              ${this.renderColumnOptions(numCols, defaultMapping?.creditColIndex ?? 5)}
            </select>
          </div>

          <div class="form-group">
            <label for="map-bal-col">Closing Balance</label>
            <select id="map-bal-col" class="form-control">
              <option value="-1">-- None --</option>
              ${this.renderColumnOptions(numCols, defaultMapping?.balanceColIndex ?? 6)}
            </select>
          </div>

          <div class="form-group">
            <label for="map-date-format">Date Format</label>
            <select id="map-date-format" class="form-control">
              <option value="DD/MM/YYYY">DD/MM/YYYY (Day-first)</option>
              <option value="DD-MM-YYYY">DD-MM-YYYY</option>
              <option value="DD-MMM-YYYY">DD-MMM-YYYY (e.g. 15-OCT-2023)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
            </select>
          </div>
        </div>

        <div class="table-preview-container card-inset">
          <h4>Detected Row Preview:</h4>
          <div class="table-scroll">
            <table class="data-table preview-table">
              <thead>
                <tr>
                  ${Array.from({ length: numCols }, (_, i) => `<th>Col ${i + 1}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${sampleRows
                  .map(
                    (row) => `
                  <tr>
                    ${Array.from({ length: numCols }, (_, c) => `<td>${this.escapeHtml(row[c] || '')}</td>`).join('')}
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="btn-cancel-mapper">Cancel</button>
          <button type="button" class="btn btn-primary" id="btn-apply-mapper">Apply Layout</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    const btnCancel = overlay.querySelector('#btn-cancel-mapper') as HTMLButtonElement;
    const btnApply = overlay.querySelector('#btn-apply-mapper') as HTMLButtonElement;

    btnCancel.onclick = () => {
      this.close();
      if (this.resolveFn) this.resolveFn(null);
    };

    btnApply.onclick = () => {
      const dateCol = parseInt((overlay.querySelector('#map-date-col') as HTMLSelectElement).value, 10);
      const narrCol = parseInt((overlay.querySelector('#map-narr-col') as HTMLSelectElement).value, 10);
      const debitCol = parseInt((overlay.querySelector('#map-debit-col') as HTMLSelectElement).value, 10);
      const creditCol = parseInt((overlay.querySelector('#map-credit-col') as HTMLSelectElement).value, 10);
      const balCol = parseInt((overlay.querySelector('#map-bal-col') as HTMLSelectElement).value, 10);
      const dateFormat = (overlay.querySelector('#map-date-format') as HTMLSelectElement).value;

      const mapping: ManualColumnMapping = {
        headerRowIndex: 0,
        dateColIndex: dateCol,
        narrationColIndex: narrCol,
        debitColIndex: debitCol !== -1 ? debitCol : undefined,
        creditColIndex: creditCol !== -1 ? creditCol : undefined,
        balanceColIndex: balCol !== -1 ? balCol : undefined,
        dateFormat
      };

      this.close();
      if (this.resolveFn) this.resolveFn(mapping);
    };
  }

  private renderColumnOptions(count: number, selectedIndex: number): string {
    let html = '';
    for (let i = 0; i < count; i++) {
      const isSel = i === selectedIndex ? 'selected' : '';
      html += `<option value="${i}" ${isSel}>Column ${i + 1}</option>`;
    }
    return html;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public close(): void {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}

export const defaultManualMapperModal = new ManualMapperModal();
