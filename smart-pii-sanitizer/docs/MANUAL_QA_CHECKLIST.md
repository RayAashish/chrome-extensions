# Manual QA Checklist - Smart PII Sanitizer

This checklist outlines the end-to-end verification steps across supported AI chat services and standalone environments.

## Supported AI Chat Sites
1. **ChatGPT** (`https://chatgpt.com`)
2. **Claude** (`https://claude.ai`)
3. **Google Gemini** (`https://gemini.google.com`)
4. **Microsoft Copilot** (`https://copilot.microsoft.com`)
5. **Perplexity AI** (`https://www.perplexity.ai`)
6. **DeepSeek Chat** (`https://chat.deepseek.com`)
7. **Grok** (`https://grok.com`)

---

## QA Test Scenarios

### 1. Site Permission Flow
- [ ] Open extension Settings (Options page).
- [ ] In the "AI Chat Sites Paste-Interception Permissions" section, verify all 7 sites are listed.
- [ ] Click **Enable** on `chatgpt.com` -> Chrome prompts for permission -> Accept.
- [ ] Verify site badge updates to "Protected".
- [ ] Click **Revoke** -> Verify permission is removed cleanly.

### 2. Paste Interception on Rich Text / ContentEditable Inputs
- [ ] Navigate to `https://chatgpt.com` (ProseMirror input) or `https://claude.ai` (Lexical input).
- [ ] Copy a sensitive test log to clipboard:
  ```text
  User: admin@company.com with token sk_live_51H8xYzAbCdEfGhIjKlMnOpQr from 192.168.1.55
  ```
- [ ] Focus the chat input and press `Cmd+V` (or `Ctrl+V`).
- [ ] **Expected:** A floating banner appears above the input:
  `Found 3 sensitive item(s): [Email] [API Key] [IP Address] [Sanitize & Paste] [Paste Original] [x]`
- [ ] Press `Enter` (or click "Sanitize & Paste").
- [ ] **Expected:** The sanitized text is inserted into the chat input:
  `User: user_A@example.com with token REDACTED_KEY_1 from 10.0.0.1`
- [ ] Verify the chat site's "Send" button becomes active and the internal editor state recognizes the text.
- [ ] Press `Cmd+Z` (Undo).
- [ ] **Expected:** The editor history restores the pre-paste state without crashing.

### 3. Normal / Non-Sensitive Paste Passthrough
- [ ] Copy non-sensitive text to clipboard: `Explain the difference between TCP and UDP.`
- [ ] Paste into chat input.
- [ ] **Expected:** Text pastes natively without any banner popup or delay.

### 4. Reverse Mapping Flow
- [ ] Submit the sanitized prompt to the AI chatbot.
- [ ] When the LLM responds referencing `user_A@example.com`, `REDACTED_KEY_1`, or `10.0.0.1`:
  - **Method A (Floating Helper):** Highlight the AI response text with mouse.
    - Floating pill "Reverse-Map Selection" appears in the bottom right corner.
    - Click the pill -> Toast displays `Restored X placeholder(s) to clipboard!`.
    - Paste clipboard into notes or code editor -> verify real values are restored.
  - **Method B (Side Panel):** Open Side Panel (`Cmd+Shift+S` or toolbar icon).
    - Switch to "Reverse Map" tab.
    - Paste LLM reply into "AI Response" input.
    - Click "Reverse Map".
    - Verify original values (`admin@company.com`, `sk_live_...`, `192.168.1.55`) appear in the Restored Output.

### 5. Overlap and Edge-Case Handling
- [ ] Paste a database connection string: `postgres://root:password123@db.internal:5432/main`
- [ ] Verify `root`, `password123`, and `db.internal` are safely redacted without breaking the URL syntax.
- [ ] Paste a date (`2026-10-22 10:14:03`).
- [ ] Verify it is NOT flagged as a phone number or IP address.
- [ ] Paste a version number (`v1.2.3.4`).
- [ ] Verify it is NOT flagged as an IP address.

### 6. Side Panel Entity Toggle (Preview Exclude)
- [ ] In the Side Panel, paste: `Contact support@company.com and billing@client.com`.
- [ ] In the Live Detection summary, click the `support@company.com` badge.
- [ ] Verify the badge becomes strikethrough.
- [ ] Click "Sanitize".
- [ ] **Expected:** `support@company.com` remains raw, while `billing@client.com` is replaced by `user_A@example.com`.

### 7. Vault Masking and Security
- [ ] In the Side Panel, navigate to "Vault" tab.
- [ ] Verify real values are masked by default (`••••••••••••`).
- [ ] Click a masked cell -> verify real value is revealed.
- [ ] Click the delete button `✕` on a single row -> verify row is removed.
- [ ] Click "Clear Vault" -> verify all mappings are wiped.

### 8. Standalone Offline Web App (`app.html`)
- [ ] Disconnect Wi-Fi or enable Airplane mode.
- [ ] Open `app.html` directly in any web browser (`file:///.../smart-pii-sanitizer/app.html`).
- [ ] Paste sensitive input and click "Sanitize Now".
- [ ] Verify dummy tokens are generated.
- [ ] Test reverse-mapping on the Reverse Map tab.
- [ ] Verify zero console errors and 100% offline functionality.
