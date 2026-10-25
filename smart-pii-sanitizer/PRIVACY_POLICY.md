# Privacy Policy for Smart PII Sanitizer

**Last Updated:** October 24, 2026  
**Effective Date:** October 24, 2026  

Smart PII Sanitizer ("the Extension", "we", "our") is committed to absolute client-side privacy, transparency, and data sovereignty. We believe your sensitive code, proprietary logs, personal identifiable information (PII), and API credentials should never leave your local device.

---

## 1. Zero Network Transmission & Local-Only Execution

* **Zero Remote Telemetry:** The Extension makes **zero network requests** (`fetch`, `XMLHttpRequest`, WebSockets, or beacons).
* **Zero Analytics & Tracking:** We do not track, log, or profile your identity, browsing habits, IP address, or sanitized text.
* **100% Local Processing:** All regex detection, entropy analysis, token substitution, and reverse-mapping calculations occur strictly within your local browser engine.

---

## 2. Information We Process and How It Is Handled

### 2.1 Text You Sanitize or Reverse-Map
* When you paste text into the Extension or use context menu actions, the text is processed locally in browser memory.
* Sensitive items (such as API keys, email addresses, IP addresses, payment cards, national IDs, and credentials) are replaced with deterministic dummy placeholders (e.g. `user_A@example.com`, `REDACTED_KEY_1`, `10.0.0.1`).
* This text is never transmitted to any external server, cloud provider, or third party.

### 2.2 The Session Vault
* To enable "Reverse Map" (restoring your original values into an AI chatbot's response), the Extension maintains an in-memory session vault mapping dummy placeholders to your real values.
* **Storage Location:** By default, vault mappings are held in ephemeral browser session storage (`chrome.storage.session`), which exists only for the duration of your browser session and is purged upon browser restart or when you click "Clear Vault".
* **Optional Encrypted Persistence:** If you explicitly enable encrypted persistence in Settings, the vault is encrypted locally using the Web Crypto API (AES-GCM 256-bit with PBKDF2 key derivation using 100,000 iterations and a local salt) before being saved to local extension storage. Your passphrase is never transmitted or saved.

---

## 3. Extension Permissions & Justifications

Smart PII Sanitizer requests minimal, scoped browser permissions required to perform client-side protection:

| Permission | Purpose |
| :--- | :--- |
| **`storage`** | Saves your local preferences (such as sensitivity thresholds, custom regex rules, and domain allowlists). |
| **`sidePanel`** | Provides the primary user interface workspace alongside your active web tabs. |
| **`clipboardRead`** | Allows you to paste text from your clipboard with a single click inside the side panel interface. |
| **`clipboardWrite`** | Copies sanitized dummy text or restored text to your clipboard upon clicking copy buttons. |
| **`contextMenus`** | Adds convenient right-click options ("Sanitize selection" and "Reverse-map selection"). |
| **`scripting` & `activeTab`** | Powers the optional real-time Paste Guard modal when pasting into designated AI chatbot web pages. |
| **`offscreen`** | Provides a sandboxed background document for reliable clipboard handling in Chrome/Edge Manifest V3 service workers. |
| **`host_permissions`**<br>(`chatgpt.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, etc.) | Strictly scoped to prominent AI chatbot web applications solely to intercept raw paste events and protect against accidental PII leaks. |

---

## 4. Third-Party Sharing

We do not sell, rent, monetize, share, or disclose any user data to third parties. We have no external servers, databases, or ad networks.

---

## 5. User Control & Data Deletion

* **Clear Vault:** You can purge all session placeholders and aliases instantly by clicking **"Clear Vault"** in the Vault tab.
* **Uninstall:** Uninstalling the Extension completely removes all local settings, cached extension storage, and rule configurations from your browser.

---

## 6. Open Source & Independent Verification

Smart PII Sanitizer is open source. Developers and security auditors can inspect and verify every line of code to confirm zero network requests and local-only processing.

---

## 7. Contact Us

If you have questions, feedback, or security inquiries regarding this Privacy Policy, please open an issue on the official GitHub repository or contact the developer via the Microsoft Edge Add-ons store listing.
