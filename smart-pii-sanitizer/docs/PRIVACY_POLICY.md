# Privacy Policy for Smart PII Sanitizer

**Last updated:** October 2026

Smart PII Sanitizer is committed to protecting your privacy. This extension is designed from first principles with a zero-telemetry, zero-network architecture.

## 1. Zero Data Collection
Smart PII Sanitizer does **not** collect, record, track, transmit, or monetize any user data, personal information, browsing history, clipboard text, or LLM conversations. 

## 2. Zero Remote Network Requests
The extension makes **ZERO network calls**. There are:
- No remote API endpoints
- No analytics or crash telemetry pings (no Google Analytics, Sentry, Mixpanel, etc.)
- No remote fonts, stylesheets, or CDNs (all icons, styles, and scripts are bundled locally)
- No background phone-home mechanisms

You can independently verify this by inspecting the browser DevTools Network tab or inspecting the extension's `manifest.json`.

## 3. Storage and Data Retention
- **Session Vault:** Sensitive data mappings (real value <-> placeholder) are stored strictly in memory via `chrome.storage.session`. This data is automatically purged when the browser is closed.
- **Optional Local Persistence:** If you explicitly opt into encrypted persistence, your vault is encrypted using the Web Crypto API (AES-GCM 256-bit with PBKDF2 key derivation from your passphrase) before being written to `chrome.storage.local`. The decryption key is never stored.
- **Settings:** Your configuration preferences (sensitivity level, custom regex rules, allowlisted domains) are saved locally on your device in `chrome.storage.local` and never leave your computer.
- **Manual Purge:** You can purge all stored mappings at any moment using the "Clear Vault" button in the Side Panel or Options page.

## 4. Third-Party Sites and Content Script Scope
Smart PII Sanitizer uses `optional_host_permissions` for AI chat websites (e.g. chatgpt.com, claude.ai). The content script only activates when you paste text into input fields on explicitly permitted domains to offer local sanitization. The extension does not inspect other tabs or non-permitted web pages.

## 5. Contact & Auditing
The source code of Smart PII Sanitizer is open and inspectable. For questions or technical audits, refer to the project repository.
