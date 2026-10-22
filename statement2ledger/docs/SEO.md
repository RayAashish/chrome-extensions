# SEO Strategy & Copywriting Guide

Target Market: Indian freelancers, salaried employees, small business owners, and Chartered Accountants converting Indian bank statements into Excel for ITR filing (ITR-1, ITR-3, ITR-4), GST reconciliation, and personal expense tracking.

## 1. High-Intent Target Queries

- `HDFC statement PDF to Excel offline`
- `SBI bank statement to CSV converter free`
- `ICICI statement password protected to Excel`
- `convert bank statement to excel without uploading`
- `privacy safe bank statement converter India`
- `convert bank statement to ledger for tax filing`
- `parse UPI narration to vendor Excel`
- `extract running balance from Indian bank PDF`

## 2. Page Metadata

```html
<title>Convert HDFC, SBI, ICICI Bank Statements to Excel | 100% Offline & Private | Statement2Ledger</title>
<meta name="description" content="Convert Indian bank statements (PDF, CSV) into clean Excel and CSV ledgers directly inside your browser. Zero cloud uploads, zero network calls, runs offline. Password protected PDFs supported." />
<meta name="keywords" content="HDFC statement to excel, SBI statement to CSV, ICICI bank statement converter, convert bank statement offline, tax filing excel ledger, UPI narration parser" />
```

## 3. Structured Data (Schema.org)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "name": "Statement2Ledger",
      "url": "https://statement2ledger.org",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "All modern web browsers",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "INR"
      },
      "featureList": [
        "100% Client-Side Processing",
        "Zero Outbound Network Requests",
        "Mathematical Running-Balance Reconciliation",
        "Password-Protected PDF Support",
        "Intelligent UPI / NEFT / IMPS Narration Parser",
        "Excel (.xlsx) with formulas and CSV Export"
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is it safe to convert my bank statement here?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. Statement2Ledger runs 100% inside your browser using WebAssembly and Web Workers. Your statements are never uploaded to any server. You can disconnect your Wi-Fi and use it completely offline."
          }
        },
        {
          "@type": "Question",
          "name": "How does it handle merged cells and multi-line narrations?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Statement2Ledger extracts positional coordinates (x, y) using pdf.js, clusters items into geometric rows, and automatically merges continuation lines into the parent transaction narration."
          }
        },
        {
          "@type": "Question",
          "name": "What Indian banks are supported?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Optimized parsers are included for HDFC Bank, State Bank of India (SBI), and ICICI Bank. All other Indian banks (Axis, Kotak, PNB, Bank of Baroda, IDFC First, IndusInd) are supported via the Generic Table parser and Manual Column Mapper."
          }
        }
      ]
    }
  ]
}
```
