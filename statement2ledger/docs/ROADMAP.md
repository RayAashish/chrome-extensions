# Statement2Ledger - Product Roadmap

Statement2Ledger is committed to 100% client-side privacy. Any future features must adhere strictly to the zero-network architecture.

---

## Phase 1 (v1.0.0 - Current Release) ✅
- **100% Client-Side Engine:** Zero network calls after initial load (`connect-src 'none'`).
- **Core Parsers:** HDFC Bank, State Bank of India (SBI), ICICI Bank (PDF and CSV variants).
- **Generic Fallback Parser:** Auto-column detection with interactive manual column mapping wizard.
- **Narration Intelligence:** Tolerant UPI, NEFT, RTGS, IMPS, ACH, Cheque, and POS tokenizers.
- **Vendor Normalization:** 170+ common Indian merchant aliases with user overrides.
- **Mathematical Reconciliation:** Integer paise arithmetic running balance audit with first-breaking-row detection.
- **Password-Protected PDF Support:** In-memory modal prompt with immediate memory wiping.
- **Audit-Ready Exports:** Formatted Excel (`.xlsx`) with formulas, summary sheets, UTF-8 BOM CSV, and JSON.
- **Tax-Season Helper:** In-app summary for TDS, interest, and large credits.
- **PWA & Offline Capable:** Service worker static caching.

---

## Phase 2 (v1.1 - Bank Layout Expansion & Credit Cards) 📅
- **Additional Dedicated Bank Parsers:**
  - Axis Bank (Retail NetBanking & Mobile App statements)
  - Kotak Mahindra Bank (Kotak 811 & NetBanking)
  - Punjab National Bank (PNB)
  - Bank of Baroda (BoB)
  - IDFC FIRST Bank
- **Credit Card Statements:**
  - HDFC Credit Card (Regalia, Millennia, Infinia)
  - SBI Card (SimplyCLICK, Elite)
  - ICICI Credit Card (Amazon Pay ICICI, Coral)
  - OneCard & Axis Bank Credit Cards
- **International Inward Remittances:**
  - Wire transfers, SWIFT messages, PayPal/Stripe INR disbursements.

---

## Phase 3 (v1.2 - Advanced Local AI & Optical Recognition) 🧠
- **Local Client-Side OCR (Tesseract.js WASM):**
  - Downloadable on-demand (~30MB local WASM) behind an explicit opt-in button.
  - Enables parsing of scanned physical paper statements without server uploads.
- **Local Small-Language-Model Categorization (WebLLM / ONNX):**
  - Optional local model (e.g. SmolLM / Phi-3 via WebGPU) running directly in the browser.
  - Zero network inference for ambiguous local merchant narrations and smart note generation.

---

## Phase 4 (v1.3 - Multilingual & Tax Integrations) 🇮🇳
- **Full Hindi & Regional Language UI:**
  - Expanded regional translations (Tamil, Telugu, Marathi, Bengali, Gujarati).
- **Automated Form 26AS & AIS Matcher:**
  - Drop Form 26AS / AIS JSON locally to cross-reconcile interest and TDS automatically against the bank ledger.

---

## Phase 5 (Future "Pro" Local Desktop Edition - Concept) 💼
*Note: Payments and monetization are not implemented in v1. All v1 features remain free and open source.*
For CAs and accounting firms requiring bulk workflows:
- **Tauri / Electron Desktop App:**
  - Batch convert entire folders of 500+ statements at once.
  - Direct export to Tally XML, Zoho Books CSV, and QuickBooks.
  - Offline saved layout presets and corporate team rule packs.
