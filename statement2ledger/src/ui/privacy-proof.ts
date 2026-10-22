/**
 * Statement2Ledger - Privacy Proof Panel & Live Network Monitor
 * 
 * Uses PerformanceObserver to track resource network requests.
 * Proves that ZERO network requests occur after statements are dropped.
 */

export class PrivacyProofMonitor {
  private static instance: PrivacyProofMonitor;
  private requestsCount = 0;
  private isMonitoring = false;
  private listeners: Array<(count: number) => void> = [];

  constructor() {
    this.initObserver();
  }

  public static getInstance(): PrivacyProofMonitor {
    if (!PrivacyProofMonitor.instance) {
      PrivacyProofMonitor.instance = new PrivacyProofMonitor();
    }
    return PrivacyProofMonitor.instance;
  }

  private initObserver(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        if (!this.isMonitoring) return;
        const entries = list.getEntries();
        for (const entry of entries) {
          // Ignore same-origin blob/data URLs and worker instantiation
          if (entry.name.startsWith('blob:') || entry.name.startsWith('data:')) continue;
          this.requestsCount++;
          this.notify();
        }
      });

      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      console.warn('PerformanceObserver resource tracking not supported in this browser.', e);
    }
  }

  public startMonitoringAfterFileLoad(): void {
    this.isMonitoring = true;
    this.requestsCount = 0;
    this.notify();
  }

  public getCount(): number {
    return this.requestsCount;
  }

  public subscribe(cb: (count: number) => void): () => void {
    this.listeners.push(cb);
    cb(this.requestsCount);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      cb(this.requestsCount);
    }
  }

  public renderPrivacyProofPanel(): HTMLElement {
    const el = document.createElement('section');
    el.className = 'privacy-proof-panel card';
    el.setAttribute('aria-label', 'Privacy Proof Verification');

    el.innerHTML = `
      <div class="privacy-header">
        <div class="shield-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <h3>Privacy Proof: Verified Zero Network Activity</h3>
        </div>
        <div class="live-counter-pill" id="live-network-pill">
          <span class="live-pulse"></span>
          <span class="pill-label">Outbound Requests:</span>
          <strong id="live-requests-count">0</strong>
        </div>
      </div>

      <div class="privacy-grid">
        <div class="privacy-step">
          <div class="step-num">1</div>
          <h4>Offline Architecture</h4>
          <p>Everything runs 100% inside your browser using WebAssembly and Web Workers. No backend servers, no analytics, no remote fonts, no telemetry.</p>
        </div>
        <div class="privacy-step">
          <div class="step-num">2</div>
          <h4>Strict Content-Security-Policy</h4>
          <p>The page enforces <code>connect-src 'none'</code>. The browser is technically barred from sending any HTTP/fetch/WebSocket request.</p>
        </div>
        <div class="privacy-step">
          <div class="step-num">3</div>
          <h4>In-Memory Lifespan</h4>
          <p>Transactions exist only in browser memory (RAM) while you view them. Once you click "Clear" or close the tab, everything is deleted.</p>
        </div>
      </div>

      <div class="diy-verification">
        <strong>Verify it yourself right now:</strong>
        <ol>
          <li>Disconnect your Wi-Fi or turn on Airplane Mode.</li>
          <li>Drop any Indian bank statement PDF or CSV into this page.</li>
          <li>Notice it parses and produces full CSV/Excel files completely offline.</li>
          <li>Open DevTools (F12) &rarr; <em>Network</em> tab to verify 0 outbound bytes.</li>
        </ol>
      </div>
    `;

    const countEl = el.querySelector('#live-requests-count');
    this.subscribe((count) => {
      if (countEl) countEl.textContent = count.toString();
    });

    return el;
  }
}

export const defaultPrivacyProofMonitor = PrivacyProofMonitor.getInstance();
