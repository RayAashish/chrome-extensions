# CodeStripper: Technical Tutorial Distiller

> Production-ready Chrome Extension (Manifest V3) that extracts, categorizes, and organizes compile-ready code snippets, configuration files, and terminal commands from messy technical tutorials into downloadable project skeletons (`.zip`).

---

## ⚡ Quick Start

### 1. Install & Build
```bash
cd code-stripper
npm install
npm run build
```

### 2. Run Test Suite
```bash
npm test
```

### 3. Package for Chrome Web Store & Microsoft Edge Add-ons
```bash
npm run package
```
Generates `codestripper-v2.0.0.zip` ready to upload directly to the Chrome Web Store Developer Dashboard and Microsoft Edge Partner Center.

### 4. Load Locally in Google Chrome, Microsoft Edge, or Brave
1. Open your browser and navigate to:
   - **Microsoft Edge**: `edge://extensions/`
   - **Google Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
2. Enable **Developer mode** (toggle in top-right corner on Chrome, or left sidebar on Edge).
3. Click **Load unpacked**.
4. Select the `code-stripper/dist` folder.
5. Open any technical tutorial (e.g. MDN Web Docs, Confluent, Baeldung, Medium, Dev.to) and click the **CodeStripper** extension icon or press **`Option + Shift + C`** on Mac (**`Alt + Shift + C`** on Windows/Linux).

---

## 📁 Repository Structure

```
code-stripper/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── package.json               # Dependencies, build scripts & packaging
├── tsconfig.json              # TypeScript strict configuration
├── vite.config.ts             # Vite + CRXJS + Tailwind CSS configuration
├── public/
│   └── icons/                 # Extension toolbar and webstore icons (16, 48, 128)
├── src/
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces & types
│   ├── core/
│   │   ├── classifier.ts      # Deterministic rule-based language & path inference
│   │   └── zipBuilder.ts      # Client-side JSZip project skeleton generator
│   ├── content/
│   │   └── extractor.ts       # Resilient DOM scraper, syntax cleaner & heading pairer
│   ├── background/
│   │   └── index.ts           # MV3 Service worker (sidePanel & command handler)
│   └── sidepanel/
│       ├── index.html         # Side panel markup
│       ├── style.css          # Tailwind CSS & theme definitions
│       └── index.ts           # Side panel controller & reactive UI state
└── test/
    ├── classifier.test.ts     # Heuristic classifier unit tests (11 tests)
    ├── extractor.test.ts      # DOM extraction & line-stripping tests (8 tests)
    └── zipBuilder.test.ts     # JSZip packaging & README generation tests (3 tests)
```
