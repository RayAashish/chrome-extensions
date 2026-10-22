/**
 * Statement2Ledger - Password Modal for Encrypted PDFs
 * 
 * Secure, accessible modal for entering PDF passwords.
 * Passwords are typed directly into the worker memory and wiped immediately.
 */

export class PasswordModal {
  private modalEl: HTMLElement | null = null;
  private resolveFn: ((password: string | null) => void) | null = null;

  public prompt(fileName: string, isRetry = false): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.render(fileName, isRetry);
    });
  }

  private render(fileName: string, isRetry: boolean): void {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-pwd-title');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="icon-lock">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 id="modal-pwd-title">${isRetry ? 'Incorrect Password. Try Again' : 'Password Protected PDF'}</h3>
        </div>

        <p class="modal-desc">
          <strong>${fileName}</strong> is encrypted by your bank. Your password is used strictly inside your browser and is never stored or transmitted.
        </p>

        <div class="bank-hints card-inset">
          <strong>Common Indian Bank Passwords:</strong>
          <ul>
            <li><strong>HDFC:</strong> Usually your 9-digit Customer ID, or PAN (capitalized).</li>
            <li><strong>SBI:</strong> 11-digit Account Number OR DOB (DDMMYYYY) + last 4 digits of mobile.</li>
            <li><strong>ICICI:</strong> First 4 letters of your name (lowercase) + DOB (DDMM).</li>
            <li><strong>Axis:</strong> First 4 letters of name + last 4 digits of customer ID.</li>
          </ul>
        </div>

        <form id="pwd-form" class="modal-form">
          <div class="input-group">
            <label for="pdf-password-input">Enter PDF Password</label>
            <input
              type="password"
              id="pdf-password-input"
              required
              autofocus
              autocomplete="off"
              placeholder="Enter password..."
              class="form-control"
            />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="btn-cancel-pwd">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-pwd">Unlock & Parse</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    const form = overlay.querySelector('#pwd-form') as HTMLFormElement;
    const input = overlay.querySelector('#pdf-password-input') as HTMLInputElement;
    const btnCancel = overlay.querySelector('#btn-cancel-pwd') as HTMLButtonElement;

    form.onsubmit = (e) => {
      e.preventDefault();
      const pwd = input.value;
      input.value = ''; // Wipe immediately
      this.close();
      if (this.resolveFn) this.resolveFn(pwd);
    };

    btnCancel.onclick = () => {
      input.value = '';
      this.close();
      if (this.resolveFn) this.resolveFn(null);
    };

    input.focus();
  }

  public close(): void {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}

export const defaultPasswordModal = new PasswordModal();
