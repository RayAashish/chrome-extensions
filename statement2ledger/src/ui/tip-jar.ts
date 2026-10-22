/**
 * Statement2Ledger - Post-Download Tip Jar
 * 
 * Strict privacy guarantee:
 * - Rendered strictly after a user-initiated download.
 * - QR code is generated 100% in-browser via canvas/SVG with zero network request.
 * - External link is a plain anchor clicked by user with rel="noopener noreferrer".
 * - Dismissible and never blocks features.
 */

import { generateUpiQRDataUrl } from '../core/qr';
import { defaultPreferencesStore } from '../storage/preferences';

export class TipJarComponent {
  private containerEl: HTMLElement | null = null;

  public render(targetEl: HTMLElement): void {
    if (defaultPreferencesStore.isTipDismissed()) return;

    const config = (window as any).__APP_CONFIG__?.support || {
      enabled: true,
      title: 'Buy me a chai',
      message: 'Processed 100% on your device. Saved you an hour? Buy me a chai.',
      upiVpa: 'statement2ledger@upi',
      payeeName: 'Statement2Ledger Open Source',
      supportUrl: 'https://github.com/sponsors/statement2ledger',
      suggestedAmounts: [50, 100, 200, 500]
    };

    if (!config.enabled) return;

    const card = document.createElement('div');
    card.className = 'tip-jar-card card';
    card.id = 'tip-jar-container';

    let currentAmount = 100;
    const qrDataUrl = generateUpiQRDataUrl(config.upiVpa, config.payeeName, currentAmount);

    card.innerHTML = `
      <div class="tip-jar-inner">
        <div class="tip-content">
          <div class="tip-badge">☕ Zero Ads &bull; 100% Offline</div>
          <h3>${config.title}</h3>
          <p>${config.message}</p>

          <div class="tip-amounts">
            ${config.suggestedAmounts
              .map(
                (amt: number) => `
              <button type="button" class="btn-amount ${amt === currentAmount ? 'active' : ''}" data-amt="${amt}">
                ₹${amt}
              </button>
            `
              )
              .join('')}
          </div>

          <div class="tip-actions">
            <a
              href="${config.supportUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary"
            >
              Support via GitHub / Web &rarr;
            </a>
            <button type="button" class="btn btn-secondary" id="btn-dismiss-tip">
              Maybe Later
            </button>
          </div>
        </div>

        <div class="tip-qr-container">
          <div class="qr-wrapper">
            <img src="${qrDataUrl}" alt="UPI QR Code" id="tip-qr-img" width="140" height="140" />
          </div>
          <span class="qr-label">Scan with GPay, PhonePe, Paytm, or BHIM</span>
        </div>
      </div>
    `;

    targetEl.prepend(card);
    this.containerEl = card;

    // Amount button events
    const amtButtons = card.querySelectorAll<HTMLButtonElement>('.btn-amount');
    const qrImg = card.querySelector<HTMLImageElement>('#tip-qr-img');

    amtButtons.forEach((btn) => {
      btn.onclick = () => {
        amtButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const selected = parseInt(btn.getAttribute('data-amt') || '100', 10);
        currentAmount = selected;
        if (qrImg) {
          qrImg.src = generateUpiQRDataUrl(config.upiVpa, config.payeeName, currentAmount);
        }
      };
    });

    const btnDismiss = card.querySelector('#btn-dismiss-tip') as HTMLButtonElement;
    btnDismiss.onclick = () => {
      defaultPreferencesStore.dismissTip();
      card.remove();
    };
  }
}

export const defaultTipJar = new TipJarComponent();
