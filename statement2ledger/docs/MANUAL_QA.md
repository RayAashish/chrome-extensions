# Statement2Ledger - Manual QA Verification Checklist

Use this checklist to perform rigorous pre-release quality assurance across desktop and mobile devices.

---

## 1. Zero-Network & Privacy Verification

- [ ] **Airplane Mode / Wi-Fi Off Test:**
  1. Open Statement2Ledger in browser.
  2. Disconnect Wi-Fi and unplug network cable.
  3. Drop a multi-page PDF statement.
  4. Verify the document parses completely and generates downloadable CSV and Excel files.
- [ ] **Network Tab Inspection:**
  1. Open Developer Tools (`F12`) &rarr; **Network** tab.
  2. Select **Fetch/XHR** filter.
  3. Drop statement and perform downloads.
  4. Verify **0 requests** are listed in the network log.
  5. Verify the live "Network requests since file loaded" pill in the UI displays `0`.
- [ ] **Content Security Policy Audit:**
  1. Check Response Headers for `connect-src 'none'`.
  2. Attempt to run `fetch('https://example.com')` in the browser console.
  3. Verify browser logs a CSP violation error blocking the request.

---

## 2. Desktop Browsers Verification

### Google Chrome (macOS / Windows / Linux)
- [ ] Drag-and-drop file into dropzone highlights border.
- [ ] Multi-file upload merges statements and eliminates duplicate overlapping entries.
- [ ] Web Worker progress bar updates smoothly without freezing UI.
- [ ] Category dropdown updates inline and prompts to remember rule.
- [ ] "Download Excel (.xlsx)" produces file opening in MS Excel / LibreOffice with formulas working in `Transactions` sheet.

### Mozilla Firefox (macOS / Windows)
- [ ] Password modal opens cleanly for encrypted PDFs.
- [ ] Fast typing and cancelling clears input value and closes modal.
- [ ] Service worker caches assets for offline reload.

### Apple Safari (macOS)
- [ ] Drag-and-drop works with native Mac finder.
- [ ] Blob downloads trigger native download manager without prompt failure.
- [ ] Text rendering of Hindi translations displays without missing glyphs.

---

## 3. Mobile Browsers Verification

### Safari on iOS (iPhone / iPad)
- [ ] File picker opens Files app / iCloud Drive.
- [ ] Selecting PDF parses in Web Worker on iOS without memory crash.
- [ ] Table horizontal scrolling is smooth with fixed column header.
- [ ] Export buttons trigger native Share Sheet / Save to Files.

### Chrome on Android (Low-Memory Device Test)
- [ ] Tested on 3GB / 4GB RAM Android device.
- [ ] Dropping a 20-page statement consumes under 150MB browser heap.
- [ ] Canvas QR code for tip jar renders sharply on mobile high-DPI screens.

---

## 4. Stress Testing & Large Statement Performance

- [ ] **300-Page Bank Statement:**
  1. Load a 300-page bank statement.
  2. Verify progress bar reports `Page X of 300`.
  3. Verify memory does not leak continuously (pages are cleaned up after text extraction).
  4. Target parsing speed: under 15 seconds on a modern laptop.
  5. Verify search and filter in Review Table respond within 100ms.

---

## 5. Security & Injection Checks

- [ ] **CSV Injection Attack:**
  1. Load statement containing malicious narration: `=cmd|' /C calc'!A0` or `-1+1`.
  2. Download CSV and inspect raw text in a plain text editor.
  3. Verify the cell is escaped with a single quote prefix: `'=cmd|...`.
- [ ] **Storage Security:**
  1. Check `localStorage.getItem('statement2ledger_user_prefs_v1')`.
  2. Verify that **NO account numbers, balances, or financial amounts** are saved.
  3. Click "Delete All Local Data" and verify storage is wiped.
