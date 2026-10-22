# Privacy Policy & Privacy Proof

**Effective Date:** October 2026  
**Product:** Statement2Ledger (`https://statement2ledger.org`)

## 1. The Core Privacy Principle: Zero Data Transmission

Statement2Ledger is engineered as a **strictly client-side static web application**. 

- **No Uploads:** Your bank statements, financial figures, transaction descriptions, account numbers, names, and passwords are never transmitted to any cloud server, API, database, or third-party service.
- **No Telemetry / No Analytics:** There are no Google Analytics, PostHog, Mixpanel, Sentry, Datadog, Facebook Pixels, or telemetry beacons installed in this app.
- **No Remote Dependencies:** All libraries (including the PDF parsing worker and WASM modules) are bundled locally and served from the same origin. No remote CDN scripts, remote fonts, or remote images are fetched.

## 2. In-Memory Processing & Local Storage

- **Financial Statements:** Parsed transactions live strictly in volatile browser memory (RAM) while your session is active. Closing the browser tab or clicking **"Clear & Start Over"** instantly discards the in-memory ledger.
- **Local Preferences:** Only non-financial configuration is stored in your browser's `localStorage`:
  - Custom merchant alias mappings (e.g. `MY GROCER -> Groceries`).
  - Column alignment templates for manual mapper.
  - UI preferences (theme, language, sensitive info masking toggle).
  - Dismissal status of the post-download tip jar.
- **No Transaction Values in Storage:** Financial balances, amounts, and account numbers are explicitly blocked from being written to persistent storage.
- **One-Click Wipe:** Clicking **"Delete All Local Data"** immediately wipes all preferences from `localStorage`.

## 3. Technical Enforcement: Strict Content-Security-Policy (CSP)

Statement2Ledger enforces technical barriers that prevent the browser from establishing outbound network connections:

```http
default-src 'self';
connect-src 'none';
img-src 'self' data: blob:;
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
style-src 'self' 'unsafe-inline';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

Because `connect-src 'none'` is set, your browser will actively abort any attempt by JavaScript to perform `fetch()`, `XMLHttpRequest`, `WebSocket`, or `EventSource` connections.

## 4. How to Verify the Zero-Network Claim Yourself

You do not need to take our word for it. You can independently verify our claims:

1. **The Wi-Fi Off / Airplane Mode Test:**
   - Disconnect your computer or phone from Wi-Fi and mobile data.
   - Drag and drop your bank statement into Statement2Ledger.
   - The application will parse the statement, compute the running balance, and download Excel/CSV files completely offline.
2. **The Browser DevTools Audit:**
   - Open Developer Tools in Chrome/Edge/Firefox/Safari (`F12` or `Cmd + Option + I`).
   - Switch to the **Network** tab.
   - Check the **"Disable cache"** checkbox and filter by **Fetch/XHR**.
   - Drop a 50-page statement.
   - Observe that exactly **zero** outbound HTTP requests are created.
3. **The Live PerformanceObserver Pill:**
   - The UI includes a live indicator tracking `PerformanceObserver` resource entries.
   - It remains at `0` throughout the parsing and export lifecycle.

## 5. Contact & Open Source Audits

Statement2Ledger is 100% open-source under the MIT license. You can inspect every line of source code, build it yourself, or run it locally:
`https://github.com/statement2ledger/statement2ledger`
