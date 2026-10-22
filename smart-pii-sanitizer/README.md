# Smart PII Sanitizer

[![Tests](https://img.shields.io/badge/tests-26%20passed-brightgreen.svg)]()
[![Zero Network](https://img.shields.io/badge/network-0%20calls%20(100%25%20local)-blue.svg)]()
[![Chrome MV3](https://img.shields.io/badge/manifest-v3-orange.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

> A client-side, zero-telemetry Chrome extension (Manifest V3) that deterministically replaces sensitive PII, credentials, and secrets with format-valid dummy tokens before pasting into AI chatbots, allowing you to seamlessly **Reverse Map** the original values back into the LLM's response.

---

## 1. Product Overview

Developers, data engineers, analysts, and legal professionals regularly paste stack traces, database dumps, JSON payloads, and source code into LLMs like ChatGPT, Claude, and Gemini. Pasting sensitive data risks exposing customer PII or proprietary cloud keys. Existing redaction tools replace sensitive text with generic tags like `[REDACTED]`, which breaks JSON syntax, corrupts code logic, and confuses the model.

**Smart PII Sanitizer** solves this with:
1. **Deterministic Token Replacement**: The same real value *always* maps to the exact same format-valid dummy placeholder within your session (e.g. `rahul.sharma@company.com` -> `user_A@example.com`, `192.168.1.45` -> `10.0.0.1`, `sk_live_...` -> `REDACTED_KEY_1`).
2. **Structure & Format Preservation**: Quotes, indentation, whitespace, and log formats are preserved untouched. Credit cards are replaced with Luhn-valid test numbers, and JWTs are replaced with 3-segment base64url placeholders.
3. **One-Click Reverse Mapping**: When the AI chatbot writes code or explanations referencing the dummy tokens, click **Reverse Map** to restore your original secrets and identifiers.
4. **100% Local / Zero Remote Calls**: Operates entirely in your browser memory. No backend, no analytics, no external scripts, no CDNs.

---

## 2. Technical Architecture & Risky Technical Problems

### Architecture Overview

```mermaid
flowchart TD
    subgraph Browser["User Browser Context"]
        subgraph WebPage["AI Chat Site (ChatGPT, Claude, etc.)"]
            PasteEvent["Paste Event (Capture Phase)"]
            PasteGuard["content/paste-guard.js (Shadow DOM Banner)"]
            FloatingPill["Floating Reverse-Map Helper"]
        end

        subgraph Core["Local Core Engine (Zero Dependencies)"]
            Detectors["core/detectors.js (Pluggable Registry)"]
            Sanitizer["core/sanitizer.js (Single-Pass & Interval Resolution)"]
            Vault["core/vault.js (Bidirectional Map & Expiry)"]
            Reverse["core/reverse.js (Longest-First & Fuzzy Map)"]
            Crypto["core/crypto.js (PBKDF2 + AES-GCM)"]
        end

        subgraph Extension["Extension UI & Background"]
            Worker["background/service-worker.js (MV3 Ephemeral Worker)"]
            SidePanel["sidepanel/sidepanel.html (Persistent Workspace)"]
            Popup["popup/popup.html (Fallback Toolbar Action)"]
            Options["options/options.html (Settings, Rules & Permissions)"]
            Storage["chrome.storage.session (In-Memory Session Vault)"]
        end

        subgraph Standalone["Standalone Offline App"]
            AppHtml["app.html (Static Offline File)"]
        end
    end

    PasteEvent --> PasteGuard
    PasteGuard --> Detectors
    Detectors --> Sanitizer
    Sanitizer <--> Vault
    Vault <--> Storage
    SidePanel <--> Vault
    FloatingPill --> Reverse
    Reverse <--> Vault
    AppHtml --> Core
```

### The 5 Riskiest Technical Problems & Solutions

| # | Technical Challenge | Why It Is Dangerous | Architectural Solution in Smart PII Sanitizer |
| :- | :--- | :--- | :--- |
| **1** | **Overlap Resolution & Priority Collisions** | Nested entities (e.g., database URL containing passwords and internal hosts, or email addresses inside mailto links) can trigger overlapping replacements that corrupt string offsets or inject malformed tokens. | Implemented a single-pass interval conflict resolution algorithm (`resolveOverlaps`). Match intervals are sorted by start index ascending and length/priority descending. When candidates overlap, higher priority specialized detectors (e.g. `stripe_key`, `db_connection_url`) take precedence over generic high-entropy fallbacks. Text construction replaces matches in non-overlapping chunks, guaranteeing tokens are never re-scanned. |
| **2** | **Paste Interception in ContentEditable / Rich-Text Editors** | AI chat sites (ChatGPT, Claude, Copilot) use complex rich text engines (ProseMirror, Lexical, Draft.js). Calling `preventDefault()` and manually modifying `target.value` or `innerHTML` breaks editor state, disables the send button, or crashes undo/redo. | We intercept `paste` on the **capture phase** (`true`). If no sensitive data is detected, the event is completely untouched. If sensitive data is found, an isolated **Shadow DOM** (`#smart-pii-paste-guard-root`) prompt is shown. Text insertion executes via `document.execCommand('insertText', false, text)` (which ProseMirror/Lexical treat as native paste transactions), falling back to synthetic `InputEvent` (`inputType: 'insertFromPaste'`) and DOM Range insertion. |
| **3** | **MV3 Service Worker Ephemeral Lifecycle** | In Manifest V3, background service workers terminate after ~30 seconds of inactivity. In-memory JavaScript objects (`const vault = new Map()`) in `service-worker.js` are destroyed upon idle shutdown. | Vault state is strictly synchronized with `chrome.storage.session`. Session storage survives worker dormancy for the lifetime of the browser session and is shared across background, side panel, and content scripts with `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`. Optional cross-restart persistence is encrypted via Web Crypto AES-GCM. |
| **4** | **False Positive Suppression & Structure Preservation** | Normal code patterns (e.g. version numbers `1.2.3.4`, dates `2026-10-22`, timestamps `10:14:03`, UUIDs) can be misidentified as IPs or phone numbers. Careless regex replacement can destroy JSON syntax. | Strict negative lookbehinds/lookaheads prevent version strings (`v1.2.3.4`) from matching IPv4. Date filters reject `YYYY-MM-DD` formats from phone detection. Credit cards must pass the **Luhn checksum algorithm**. Replacements preserve quotes, brackets, and delimiters so that `JSON.parse()` remains 100% valid before and after. |
| **5** | **Reverse Mapping Collisions & Deformed LLM Replies** | If `REDACTED_KEY_1` and `REDACTED_KEY_10` exist, naive replacement corrupts `REDACTED_KEY_10` into `[OriginalKey1]0`. LLMs also frequently lowercase tokens (`redacted_key_1`) or add spaces around emails (`user_A @ example.com`). | Reverse mapping rules are sorted by **placeholder length descending** (longest placeholder first). Exact match runs first, followed by case-insensitive matching and spacing tolerance. Lingering or unmatched placeholders are detected and surfaced as visual warnings. |

---

## 3. Installation Guide (Load Unpacked)

Smart PII Sanitizer requires no npm build step or runtime dependencies.

1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/smart-pii-sanitizer.git
   cd smart-pii-sanitizer
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** via the toggle in the upper-right corner.
4. Click **Load unpacked** in the top left.
5. Select the `smart-pii-sanitizer` directory.
6. The Smart PII Sanitizer shield icon will appear in your Chrome extensions toolbar!

---

## 4. Usage Workflows

### 4.1 Side Panel Workspace (Primary UI)
- Click the extension icon in your toolbar, or press `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Windows) to open the Chrome Side Panel.
- **Sanitize Tab**: Paste logs, JSON, or stack traces into the **Input** textarea. A live detection summary highlights detected categories. Click any badge to exclude it. Click **Sanitize** to generate format-valid dummy tokens.
- **Reverse Map Tab**: Paste the AI chatbot's response or generated code. Click **Reverse Map** to restore your original values.
- **Vault Tab**: Inspect your session's token dictionary. Real values are masked by default (`••••••••••••`)—click to reveal or delete individual mappings.

### 4.2 Paste Guard on AI Chat Sites
- Navigate to ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, or Grok.
- Enable the site in **Settings > AI Chat Sites Permissions**.
- Paste sensitive data into the chat input.
- A non-intrusive banner will appear directly above the input:
  ```text
  Found 3 sensitive items: [Email] [API Key] [IP Address]
  [Sanitize & Paste (Enter)] [Paste Original (P)] [Dismiss (Esc)]
  ```
- Press `Enter` to sanitize and insert dummy tokens immediately!

### 4.3 Floating Reverse-Map Helper
- Highlight an AI response containing dummy tokens on any chat page.
- A floating pill titled **Reverse-Map Selection** appears in the bottom right corner.
- Click it to restore original values directly to your clipboard.

### 4.4 Standalone Web App Mode (`app.html`)
For restricted corporate laptops or air-gapped environments where extensions cannot be installed:
- Double-click `app.html` to open it in any web browser (`file:///.../app.html`).
- Enjoy the full sanitization, reverse mapping, and vault viewer functionality with 100% offline capability.

---

## 5. How to Verify Nothing Leaves Your Machine

We encourage every security engineer and developer to audit Smart PII Sanitizer:

1. **Inspect `manifest.json`**:
   Verify that there are **no broad `<all_urls>` host permissions**. Permissions are restricted to local `storage`, `sidePanel`, `contextMenus`, `scripting`, and site-specific `optional_host_permissions`.
2. **Inspect DevTools Network Tab**:
   Open Chrome DevTools (`F12`), go to the **Network** tab, and filter by `Fetch/XHR`, `WS`, or `All`. Perform sanitization and reverse mapping. Notice **zero network requests are dispatched**.
3. **Audit the Source Code**:
   Search the codebase for `fetch(`, `XMLHttpRequest`, `navigator.sendBeacon`, or `WebSocket`. There are zero remote network calls in the entire codebase.
4. **Test Offline**:
   Turn off Wi-Fi or disconnect your Ethernet cable. The extension and `app.html` continue to function with full capabilities.

---

## 6. Manifest Permissions Justification

| Permission | Technical Justification |
| :--- | :--- |
| `storage` | Required for `chrome.storage.session` to retain in-memory vault mappings across service worker dormant cycles, and `chrome.storage.local` to store user settings (sensitivity, custom regex rules, allowlist). |
| `sidePanel` | Required to provide a persistent, non-intrusive side-by-side workspace alongside AI chat websites. |
| `contextMenus` | Required to provide "Sanitize selection" and "Reverse-map selection" context menu commands for fast developer workflows. |
| `scripting` | Required to inject clipboard paste-guard into permitted host origins and copy text in selection workflows. |
| `optional_host_permissions` | Grants access strictly on-demand per site (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Grok) rather than broad invasive permissions at install time. |

---

## 7. Known Limitations & Human Review Notice

> **Automated detection can miss things. Always review before sending.**

While Smart PII Sanitizer employs regular expressions, Shannon entropy calculations, and checksum validators (Luhn), no pattern-based tool can guarantee 100% detection:
- Novel or unstructured secret formats (e.g., custom internal tokens lacking recognizable prefixes or entropy) may not trigger detection.
- Highly stylized personal names without contextual cues (e.g., lowercase names in informal prose) may be skipped in balanced mode.
- Users should always inspect the highlighted preview in the Side Panel before submitting sensitive payloads to third-party AI services.

---

## 8. Verification & Acceptance Test

To run the unit and acceptance test suite:
```bash
npm test
```

### Worked Example Test Run
Given raw input:
```text
2026-10-22 10:14:03 ERROR auth failed
user_email: “rahul.sharma@company.com”
ip: “192.168.1.45”
api_key: “sk_live_51H8xYzAbCdEfGhIjKlMnOpQr”
retry from rahul.sharma@company.com at 192.168.1.45
```

Produces deterministic, format-preserving output:
```text
2026-10-22 10:14:03 ERROR auth failed
user_email: “user_A@example.com”
ip: “10.0.0.1”
api_key: “REDACTED_KEY_1”
retry from user_A@example.com at 10.0.0.1
```

Pasting an AI response containing `user_A@example.com`, `10.0.0.1`, and `REDACTED_KEY_1` into Reverse Map restores the original values verbatim.

---

## 9. "Pro" Feature Roadmap (Preserving Privacy Promise)

The following future enhancements are planned without compromising the zero-telemetry architecture:

- [ ] **Encrypted Team Rule Packs**: Import/export team-wide custom regex rules via password-protected or PGP-encrypted files (no centralized cloud server).
- [ ] **Extended Compliance Detectors**: Pre-configured regional profiles (GDPR EU IBANs, HIPAA Medical Record Numbers, Australian TFN, UK NHS numbers).
- [ ] **Local WebAssembly NER**: Optional offline ONNX / WebAssembly Named Entity Recognition (NER) model for deeper context-aware person and organization detection.
- [ ] **Local File Sanitizer**: Drag-and-drop `.env`, `.csv`, and `.log` file sanitizer with automatic local file download.

---

## 10. License

MIT License. Designed and engineered for privacy-conscious developers and teams.
