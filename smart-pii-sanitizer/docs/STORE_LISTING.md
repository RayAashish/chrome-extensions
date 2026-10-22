# Chrome Web Store Listing - Smart PII Sanitizer

## 1. Extension Title
**Smart PII Sanitizer - Local Privacy Guard for AI**

## 2. Short Description (max 132 chars)
Zero-network, deterministic PII & secret sanitizer with bidirectional reverse-mapping. Protect data before pasting into AI chatbots.

## 3. Long Description
**Never leak sensitive credentials, PII, or internal tokens to AI chatbots again.**

When pasting code, stack traces, JSON logs, database dumps, or emails into ChatGPT, Claude, Gemini, Copilot, and other LLMs, you risk exposing private user data, proprietary company secrets, or violating privacy compliance (GDPR, HIPAA, PCI-DSS).

Existing redaction tools simply replace data with `[REDACTED]`, which breaks syntax, destroys log structure, and renders code snippets useless.

**Smart PII Sanitizer** solves this with **Deterministic, Structure-Preserving Token Replacement and Reverse Mapping**:
1. **Deterministic Swapping**: The same real value ALWAYS maps to the same format-valid placeholder within your session (e.g., `rahul.sharma@company.com` -> `user_A@example.com`, `192.168.1.45` -> `10.0.0.1`, `sk_live_...` -> `REDACTED_KEY_1`).
2. **Structure-Preserving**: JSON stays valid JSON, quotes and delimiters remain untouched, log formats stay intact, and credit cards are format-valid Luhn test cards so the LLM completely understands your data context.
3. **One-Click Reverse Mapping**: When the AI chatbot replies with the dummy values, click "Reverse Map" to swap your original real values back into the response or generated code.
4. **100% Client-Side & Zero Network Calls**: Runs entirely inside your browser. No telemetry, no analytics, no external servers, no third-party CDNs.

### Key Features
- **Persistent Side Panel Workspace**: Dual-pane editor for real-time live preview, entity badges, and interactive exclude toggles.
- **Smart Paste Guard**: Intercepts pastes on ChatGPT, Claude, Gemini, Copilot, DeepSeek, Perplexity, and Grok with an isolated Shadow DOM banner. Choose "Sanitize & Paste" or "Paste Original" with keyboard shortcuts.
- **Floating Reverse-Map Helper**: Select an AI reply or code block to restore real values directly to your clipboard.
- **Cryptographic Ephemeral Vault**: Session vault lives in browser memory (`chrome.storage.session`) and is cleared on browser close. Includes optional AES-GCM 256-bit passphrase encryption.
- **Comprehensive Detection Engine**:
  - Emails, IPv4, IPv6, internal domains (`.internal`, `.corp`)
  - Cloud keys: AWS (`AKIA...`), GitHub (`ghp_`, `github_pat_`), Stripe (`sk_live_`), Slack (`xoxb-`), Google API keys (`AIza...`)
  - JWT tokens (3-part format-valid base64url placeholders)
  - Database connection strings (`postgres://user:pass@host/db`)
  - PEM private key blocks
  - Financial: Luhn-validated credit card numbers
  - National IDs: US SSN, Indian PAN, Indian Aadhaar
  - Phone numbers & high-entropy secret assignments
- **Custom Regex Rule Builder & Allowlist**: Add custom organization rules and never redact your company's public domains.
- **Standalone Offline Web App**: Also includes an offline single-file `app.html` for air-gapped machines where extensions cannot be installed.

---

## 4. Single-Purpose Statement
Smart PII Sanitizer has a single, focused purpose: to detect and deterministically replace sensitive personal data and secrets with format-preserving dummy tokens locally in the browser before submitting text to AI chat services, allowing users to reverse-map their original values back into the AI's response.

---

## 5. Permission Justifications

| Permission | Justification |
| :--- | :--- |
| `storage` | Required for `chrome.storage.session` to hold in-memory token mappings across ephemeral background service worker cycles, and `chrome.storage.local` to store user settings (sensitivity, custom regex rules, allowlist). |
| `sidePanel` | Required to provide a persistent, non-intrusive side-by-side workspace alongside AI chat websites. |
| `contextMenus` | Required to offer "Sanitize selection" and "Reverse-map selection" context menu commands for quick developer workflows. |
| `scripting` | Required to execute selection copy commands and inject clipboard paste-guard into permitted host origins. |
| `optional_host_permissions` | Requested on-demand per site (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Grok) so the paste guard operates only on sites the user explicitly enables. |

---

## 6. Required Icon Assets
- `icons/icon16.png` (16x16 px) - Toolbar and favicon display
- `icons/icon32.png` (32x32 px) - Windows high-DPI display
- `icons/icon48.png` (48x48 px) - Chrome extensions management page
- `icons/icon128.png` (128x128 px) - Chrome Web Store listing & installation prompt
- `icons/icon.svg` - Scalable vector source
