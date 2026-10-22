# Statement2Ledger 🇮🇳

> **Convert Indian bank statements (HDFC, SBI, ICICI, Axis, Kotak) to standardized, audit-ready Excel and CSV ledgers with 100% client-side privacy. Zero network requests after page load. Works completely offline with Wi-Fi turned off.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero Network Requests](https://img.shields.io/badge/Privacy-Zero%20Network%20Activity-brightgreen.svg)](#privacy-architecture)
[![Client-Side Only](https://img.shields.io/badge/Architecture-100%25%20Browser%20WASM-blueviolet.svg)](#architecture)
[![Vitest Passing](https://img.shields.io/badge/Tests-85%2F85%20Passing-success.svg)](#testing)

---

## The Problem

Downloading bank statements from Indian banks and preparing them for tax filing (ITR-1, ITR-3, ITR-4), GST audits, or accounting is frustrating:
- **Merged cells and multi-line narrations:** UPI handles, RRN numbers, and merchant remarks wrap across 2 to 6 lines.
- **Inconsistent date and number formats:** Day-first Indian dates (`DD/MM/YYYY`, `DD-MMM-YYYY`), Indian numbering grouping (`1,23,456.78`), and split Withdrawal/Deposit columns.
- **Privacy Nightmare:** Most online statement converters upload your highly sensitive financial PDFs to external cloud servers, exposing your salary, account balance, and spending habits.

**Statement2Ledger solves this by doing 100% of the extraction, normalization, categorization, and Excel generation directly inside your web browser.**

---

## Key Features

1. **Strict Privacy by Architecture:**
   - No backend, no telemetry, no tracking, no CDN scripts, no remote fonts.
   - Enforced by strict Content-Security-Policy: `connect-src 'none'`.
   - In-memory lifecycle: transactions are released when you close the tab or click "Clear".
   - Account numbers and customer names can be masked (keeps only last 4 digits) by default.
2. **Positional PDF Reconstruction:**
   - Uses `pdf.js` with (x, y) clustering to rebuild tabular rows accurately.
   - Merges multi-line continuation narrations into a single row without creating phantom transactions.
   - Filters out page headers, footers, "Carried Forward", and summary blocks cleanly.
3. **Narration Intelligence & 170+ Indian Merchants:**
   - Tolerant tokenizers for messy UPI VPAs, IFSC codes (`^[A-Z]{4}0[A-Z0-9]{6}$`), and 12-digit RRNs.
   - Pre-seeded alias dictionary mapping 170+ Indian merchants (Swiggy, Zomato, Blinkit, Zepto, Uber, Ola, IRCTC, Amazon, Flipkart, Zerodha, Groww, Jio, Airtel, etc.).
   - Automatic mode detection: `UPI`, `NEFT`, `RTGS`, `IMPS`, `ACH/NACH`, `POS`, `ATM`, `CHEQUE`, `SALARY`, `INTEREST`, `TDS`, `CHARGES`.
4. **Mathematical Running-Balance Reconciliation:**
   - Verifies every row: `Previous Balance + Credit - Debit == Stated Balance` using exact integer paise arithmetic (no floating point errors).
   - Prominently flags any discrepancy and pinpoints the first breaking row.
5. **Audit-Ready Exports:**
   - **Excel (.xlsx):** Multi-sheet workbook including `Transactions` (with native Excel formulas for totals), `Summary by Category`, `Monthly Summary`, `Top Vendors`, `Reconciliation Report`, `Unparsed Lines`, and `Read Me`.
   - **CSV:** UTF-8 with BOM for Excel compatibility, plain decimals, and CSV formula injection protection (`'`, `=`, `+`, `-`, `@`).
   - **JSON & Tax-Season View:** Summary of taxable interest, Section 194A TDS, advance tax, and business income candidates.
6. **Encrypted & Multi-File Support:**
   - Prompts for password-protected PDFs locally and wipes password from memory immediately.
   - Drag and drop multiple statements to merge them into one chronologically sorted ledger with duplicate detection.
7. **Manual Column Mapping Wizard:**
   - Fallback interactive wizard to map custom columns for unknown bank layouts.

---

## Supported Banks

| Bank | Formats | Status | Column Layout |
| :--- | :--- | :--- | :--- |
| **HDFC Bank** | PDF, CSV, TXT | Fully Supported | `Date \| Narration \| Chq/Ref \| Value Dt \| Withdrawal \| Deposit \| Closing Balance` |
| **State Bank of India (SBI)** | PDF, CSV, TXT | Fully Supported | `Txn Date \| Value Date \| Description \| Ref No. \| Branch Code \| Debit \| Credit \| Balance` |
| **ICICI Bank** | PDF, CSV, TXT | Fully Supported | `Value Date \| Txn Date \| Cheque No. \| Remarks \| Withdrawal \| Deposit \| Balance` |
| **Axis Bank, Kotak, PNB, BoB, IDFC, etc.** | PDF, CSV, TXT | Supported | Generic Table Parser with automatic column detection + Manual Mapping Wizard |

---

## Privacy Proof & Verification

Verify our zero-network claim in 3 simple steps:
1. **Turn off Wi-Fi or turn on Airplane Mode.**
2. Drop any bank statement into Statement2Ledger.
3. Observe that extraction, reconciliation, and Excel generation complete without an internet connection.
4. Open Developer Tools (`F12`) &rarr; **Network** tab to verify that **zero outbound HTTP requests** were sent.

---

## How to Add a New Bank Parser

All parsers implement the pluggable `StatementParser` interface:

```typescript
// src/parsers/my-bank.ts
import { StatementParser, DetectionResult, ParsedBankData } from './types';
import { StatementMetadata, ParseOptions } from '../types';

export class MyBankParser implements StatementParser {
  public id = 'mybank';
  public name = 'My Bank';

  public detect(sampleText: string): DetectionResult {
    const isMyBank = sampleText.includes('MY BANK LIMITED');
    return {
      confidence: isMyBank ? 0.9 : 0.0,
      bankName: 'My Bank'
    };
  }

  public extractMetadata(sampleText: string): StatementMetadata {
    // Extract masked account number and period
    return { bankName: 'My Bank', accountNumberMasked: 'XXXX1234', currency: 'INR', sourceFormat: 'PDF' };
  }

  public async parse(data: any, meta: StatementMetadata, options: ParseOptions): Promise<ParsedBankData> {
    // Parse transactions and unparsed lines
    return { transactions: [], unparsedLines: [], metadata: meta };
  }
}
```

Register your parser in `src/parsers/index.ts`:
```typescript
defaultParserRegistry.register(new MyBankParser());
```

---

## How to Add a New Vendor Alias

Add the vendor and its real-world statement aliases to `data/vendors.json`:

```json
{
  "normalized": "My New Merchant",
  "category": "Food & Dining",
  "subcategory": "Restaurants",
  "aliases": ["MY NEW MERCHANT", "MYNEWMERCHANT", "merchant@upi"]
}
```

---

## Privacy-Safe Bug Reporting (Anonymized Layouts)

If a bank statement layout fails to parse, click the **"Copy Layout"** button in the app. This generates an anonymized structural skeleton where:
- All digits are replaced with `9`
- All uppercase letters are replaced with `A`
- All lowercase letters are replaced with `a`
- Personal names, account numbers, and exact financial figures are completely masked.
- Positional coordinates (x, y) and widths are preserved.

Paste this snippet into a GitHub Issue for contributors to adjust column boundaries without ever seeing your private data.

---

## Getting Started & Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation
```bash
git clone https://github.com/statement2ledger/statement2ledger.git
cd statement2ledger
npm install
```

### Run Locally (Dev Server)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Generate Synthetic Test Fixtures
```bash
npm run generate-fixtures
```
Generates synthetic PDFs and CSVs for HDFC, SBI, and ICICI in `fixtures/`.

### Run Test Suite
```bash
npm run test
```
Executes all 85 unit, fuzz, property, and integration tests with Vitest.

### Build Production Bundle
```bash
npm run build
```
Produces an optimized, fully static distribution in `dist/`.

---

## Deployment Guidance

Statement2Ledger can be hosted on any static web host with zero server configuration:

- **Cloudflare Pages:** Set build command `npm run build` and output directory `dist`. The bundled `_headers` file automatically applies the strict CSP.
- **Netlify:** Build command `npm run build`, publish directory `dist`.
- **GitHub Pages:** Deploy the contents of `dist/` directly to your `gh-pages` branch.

---

## License

MIT License. Free and open source for everyone.
