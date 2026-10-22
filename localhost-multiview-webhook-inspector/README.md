# Localhost Multi-View & Webhook Inspector

> **Production-grade Chrome Extension (Manifest V3)** for frontend engineers, full-stack developers, and QA engineers testing responsive web layouts and webhook integrations locally.
> **Runs 100% locally on your machine.** Zero telemetry, zero analytics, zero remote script/font dependencies, and zero cloud tunnels required.

---

## Table of Contents

1. [Features](#features)
   - [Feature A: Multi-View Workspace](#feature-a-multi-view-workspace)
   - [Feature B: Webhook Inspector](#feature-b-webhook-inspector)
2. [Architecture & Technical Design](#architecture--technical-design)
   - [The 6 Core Technical Challenges & Solutions](#the-6-core-technical-challenges--solutions)
3. [Installation (Load Unpacked)](#installation-load-unpacked)
4. [Step-by-Step Usage Walkthrough](#step-by-step-usage-walkthrough)
5. [Worked Acceptance Scenario Verification](#worked-acceptance-scenario-verification)
6. [Security & Header Modifications (DNR Rules)](#security--header-modifications-dnr-rules)
7. [Permissions Justification Table](#permissions-justification-table)
8. [Known Technical Limitations & Mitigations](#known-technical-limitations--mitigations)
9. [Automated Testing & QA Verification](#automated-testing--qa-verification)
10. [Chrome Web Store Listing Copy & Policy Draft](#chrome-web-store-listing-copy--policy-draft)
11. [Optional Pro / Tip-Jar Roadmap](#optional-pro--tip-jar-roadmap)

---

## 1. Features

### Feature A: Multi-View Workspace

- **Simultaneous Synchronized Viewports:** Render your local web application in Mobile (iPhone 15: 393×852, DPR 3), Tablet (iPad 10th Gen: 820×1180, DPR 2), and Desktop (1920×1080, DPR 1) side-by-side inside a single tab.
- **Bi-directional State Synchronization:**
  - **Scroll:** Synced across viewports using normalized percentage of scrollable height (`scrollTop / (scrollHeight - clientHeight)`), compensating for varying page heights across responsive breakpoints.
  - **Click:** Resolved using a resilient composite locator strategy (`data-testid` → reliable `id` → `name` → `aria-label` → role + text snippet → structural CSS path).
  - **Element Mismatch Indicator:** If an element clicked in the leader viewport does not exist or is hidden in a follower viewport (e.g. desktop sidebar item hidden behind a mobile hamburger), the follower displays a non-blocking diagnostic toast: `⚠️ Element not found/hidden in this viewport`.
  - **Form Inputs & Framework State:** Uses native prototype property setters (`HTMLInputElement.prototype.value` and `HTMLInputElement.prototype.checked`) followed by bubbling `input` and `change` events, ensuring full reactivity in React, Vue, and Angular controlled inputs.
  - **Navigation:** Mirrors URL changes (`pushState`, `replaceState`, `hashchange`, `popstate`, full reloads) across all viewports.
- **Loop Prevention Engine:** Every synthetic interaction replayed in a follower is tagged with an origin token and wrapped in an immediate suppression window to guarantee zero feedback loops.
- **Scaled Viewport Engine:** True CSS pixel rendering inside iframes ensures internal media queries respond accurately. Large viewports fit smoothly into your display using CSS `transform: scale()` with zoom modes (Fit, 100%, 75%, 50%, 33%).
- **Responsive Diagnostics:**
  - **Horizontal Overflow Detector:** Highlights offending elements whose bounding boxes exceed the viewport width in bright red, displaying exact pixel overflow and CSS selectors.
  - **Active Breakpoint Badges:** Displays real-time Tailwind (`sm`, `md`, `lg`, `xl`, `2xl`) and Bootstrap (`sm`, `md`, `lg`, `xl`, `xxl`) active media query indicators per frame.
  - **Touch Target Size Warning:** Flags interactive elements smaller than 44×44 CSS pixels.
  - **Alignment Grid & Screenshot:** Toggle an alignment grid overlay and capture PNG screenshots of your viewports.

---

### Feature B: Webhook Inspector

- **Local Request Composer & Dispatcher:** Compose, dispatch, and replay webhook HTTP requests directly against your local endpoints (`http://localhost:8080/api/webhooks/...`) without requiring a public cloud tunnel or third-party service.
- **Web Crypto Signature Simulation:** Automatically compute valid HMAC signatures using the browser's built-in `crypto.subtle` API:
  - **Stripe:** Compliant `Stripe-Signature` (`t={timestamp},v1={hmac_sha256}`)
  - **GitHub:** Compliant `X-Hub-Signature-256` (`sha256={hmac_sha256}`)
  - **Shopify:** Base64-encoded `X-Shopify-Hmac-Sha256`
  - **Generic HMAC:** Custom header and hex/base64 encoding
- **Dynamic Variable Substitution:** Inject live dynamic tokens anywhere in URLs, headers, or JSON bodies:
  - `{{timestamp}}` (Unix epoch seconds)
  - `{{timestamp_ms}}` (Unix epoch milliseconds)
  - `{{iso_timestamp}}` (ISO-8601 string)
  - `{{uuid}}` (RFC-4122 v4 UUID)
  - `{{random_int}}` (Random 5-digit number)
  - `{{random_email}}` (Local developer test email)
- **Built-in Payload Templates:** Stripe (`checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`), GitHub (`push`, `pull_request`), Slack, Twilio, Shopify, Razorpay, and generic JSON.
- **Response Inspector & Line Diff:** Inspect HTTP status, round-trip timing, response headers, pretty-printed JSON, and line-by-line diffs against previous responses.
- **Request History & Collections:** Filter history by method, status, or tag; replay previous requests; import/export collections as JSON; and securely manage signing secrets in `chrome.storage.local`.
- **DevTools Panel ("Local Inspector"):** Real-time observation of outbound requests made by your application to localhost, with a "Send to Webhook Composer" button for instant replays.
- **Optional Companion Receiver:** Single-file, zero-dependency Node.js script (`companion/receiver.js`) to capture incoming webhooks on localhost port 9999.

---

## 2. Architecture & Technical Design

### The 6 Core Technical Challenges & Solutions

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WORKSPACE PARENT TAB                            │
│           chrome-extension://.../workspace/workspace.html              │
│                                                                        │
│   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ │
│   │ Viewport 1 (Mobile)│ │ Viewport 2 (Tablet)│ │Viewport 3 (Desktop)│ │
│   │ 393 × 852 (Scale)  │ │ 820 × 1180 (Scale) │ │1920 × 1080 (Scale) │ │
│   │ [frame-agent.js]   │ │ [frame-agent.js]   │ │ [frame-agent.js]   │ │
│   └─────────┬──────────┘ └─────────▲──────────┘ └─────────▲──────────┘ │
│             │                      │                      │            │
│             │ User scrolls / types │ Replay event         │ Replay     │
│             ▼                      │                      │            │
│   ┌────────────────────────────────┴──────────────────────┴────────┐   │
│   │                 HUB-AND-SPOKE MESSAGE RELAY                    │   │
│   │    - Channel Token Validation (crypto.randomUUID)              │   │
│   │    - Loop Suppression Window (80ms tag + isReplay flag)        │   │
│   │    - Mismatch Diagnostics (Missing / Hidden Toast)             │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Iframe Embedding Headers (`X-Frame-Options` & CSP):**
   *Problem:* Dev servers (Spring Boot, Next.js, Django, Vite) often send `X-Frame-Options: SAMEORIGIN` or `frame-ancestors 'self'`, causing Chrome to refuse iframe rendering inside extension pages.
   *Solution:* We register dynamic session rules via `chrome.declarativeNetRequest.updateSessionRules`. The rule removes `X-Frame-Options` and `Content-Security-Policy` **strictly** on requests where `resourceTypes: ["sub_frame"]` and the request URL matches local-dev hosts (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`). Top-level navigation and external websites are never modified. Rules are removed when the workspace closes.

2. **Event Feedback Loop Prevention:**
   *Problem:* An event synced from Frame 1 to Frame 2 triggers Frame 2's event listeners, which would echo back to Frame 1 in an infinite ping-pong loop.
   *Solution:* Every frame agent maintains `isReplaying` and `suppressUntil = performance.now() + 80`. Synthetic events dispatched in a follower are flagged; native event listeners check `if (isReplaying || performance.now() < suppressUntil || !event.isTrusted) return;`. Combined with sequence IDs and channel tokens, echoing is 100% prevented.

3. **React / Vue / Angular Controlled Input Synchronization:**
   *Problem:* Setting `input.value = "text"` directly fails in React 16+ because React overrides the value setter to track changes. If called directly, React's state is not notified and the input reverts.
   *Solution:* We retrieve the native prototype descriptor:
   ```javascript
   const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
   descriptor.set.call(targetElement, payload.value);
   targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
   targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
   ```
   For checkboxes and radio buttons, we use `HTMLInputElement.prototype.checked`.

4. **Locator Robustness Across Responsive Layouts:**
   *Problem:* An element ID or CSS selector that works on Desktop might not exist on Mobile (e.g. sidebar nav links hidden behind a hamburger menu).
   *Solution:* We construct a composite locator (`testId` → `id` → `name` → `aria-label` → role + text snippet → CSS path). When resolving on a follower, if the element does not exist or has `display: none` / `getClientRects().length === 0`, we emit `LMVI_ELEMENT_NOT_FOUND`. The follower displays a toast: `⚠️ Target element "nav-settings": Hidden in this breakpoint`.

5. **Scaled-Iframe Pointer Accuracy & Viewport CSS Pixels:**
   *Problem:* Applying `transform: scale()` can skew pointer coordinates and mouse clicks.
   *Solution:* Because all interactions are synchronized via element locators rather than raw client coordinates, coordinate skew is bypassed entirely. Inside the iframe, the browser natively scales mouse events to the internal coordinate system. Scroll sync is computed as a normalized percentage of document scroll height, independent of scale.

6. **Manifest V3 Ephemeral Service Worker Lifecycle:**
   *Problem:* In MV3, the background service worker terminates after ~30 seconds of inactivity.
   *Solution:* High-frequency interaction synchronization runs entirely in the workspace tab (which stays open as a standard DOM page) and communicates directly with framed child content scripts via `window.postMessage`. Long-lived preferences are stored in `chrome.storage.local`. The service worker is used solely for initial action clicks, keyboard shortcuts, and DNR rule registration.

---

## 3. Installation (Load Unpacked)

1. Clone or download this repository to your local computer:
   ```bash
   cd /path/to/localhost-multiview-webhook-inspector
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the `localhost-multiview-webhook-inspector` folder.
6. The extension icon will appear in your Chrome toolbar. Pin it for easy access.

---

## 4. Step-by-Step Usage Walkthrough

### Launching the Workspace
1. Start your local development application (e.g. `http://localhost:3000`).
2. Click the extension toolbar icon or press `Command+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux).
3. The popup verifies the local origin and provides a **Launch Multi-View Workspace** button.
4. A dedicated workspace tab opens (`workspace.html`), rendering your app in three synchronized viewports.

### Using the Synchronization Toolbar
- **Master Sync Toggle:** Turn global interaction mirroring on or off.
- **Zoom Selector:** Switch between `Fit View`, `100%`, `75%`, `50%`, or `33%`.
- **Overflow Detector:** Click **Overflow** to scan all elements across viewports and highlight any horizontal overflow culprits with a bright red outline and exact overflow pixel count.
- **Touch Target Check:** Click **Touch Target** to highlight any buttons or links smaller than 44×44px.
- **Orientation:** Click the rotate icon on any viewport card to switch between Portrait and Landscape.
- **Frame Sync Modes:** Change any viewport from `Sync (All)` to `Lead Only`, `Follow Only`, or `Independent`.

### Using the Webhook Inspector
1. Switch to the **Webhooks** tab or click **Split View** in the top navigation bar.
2. Select a payload template (e.g. `Stripe: checkout.session.completed`).
3. Set your local target endpoint (`http://localhost:8080/api/webhooks/stripe`).
4. Select the `Stripe` signature scheme and enter your test signing secret (e.g. `whsec_test_secret_12345`).
5. Click **Send Request**. The inspector dispatches the HTTP request, validates the HMAC signature, displays response timing and status, and saves the request to history for instant replay.

---

## 5. Worked Acceptance Scenario Verification

We provide an end-to-end acceptance demo under `/demo`.

### Running the Acceptance Scenario:

```bash
# 1. Start the demo test servers (Port 3000 for App, Port 8080 for Webhooks)
node demo/server.js
```

### Verification Steps:
1. **Embedding without X-Frame-Options errors:** Open `http://localhost:3000` and click the extension icon. The workspace loads all three frames side-by-side with zero framing errors (our DNR rule strips `X-Frame-Options: SAMEORIGIN`).
2. **React Controlled Input Sync:** Type a name in the mobile frame form input. Notice the name appears simultaneously in the tablet and desktop frames, and the live preview component updates in all three.
3. **Scroll Percentage Sync:** Scroll the desktop frame to ~60% scroll height. The tablet and mobile frames scroll to ~60% of their respective document heights.
4. **Element Mismatch Indicator:** Click the "Settings" button in the desktop sidebar. On the mobile frame, the desktop sidebar is hidden behind a hamburger menu. The mobile frame displays the toast: `⚠️ Element "nav-settings": Hidden in this breakpoint`.
5. **Overflow Detector:** Click the **Overflow** button in the workspace toolbar. The deliberate 600px-wide table in the mobile frame is outlined in red with a badge: `⚠️ OVERFLOW: 207px`.
6. **Webhook Signature & Execution:** Switch to the Webhook view, select Stripe `checkout.session.completed`, target `http://localhost:8080/api/webhooks/stripe`, and click **Send Request**. The response returns `200 OK`, response headers are displayed, and the request appears in the replay history.
7. **Clean Closure:** Close the workspace tab. The service worker cleans up the session DNR rules, leaving standard browser tabs unaffected.

---

## 6. Security & Header Modifications (DNR Rules)

### What Headers Are Modified and Why?
Modern dev servers (Spring Boot, Next.js, Django, Rails) send `X-Frame-Options: SAMEORIGIN` or `Content-Security-Policy: frame-ancestors 'self'` to protect against clickjacking on the open internet. However, this prevents developers from testing their responsive layouts inside local iframe workspaces.

### How We Solve This Safely:
- **DeclarativeNetRequest Session Rules:** We use Chrome's `declarativeNetRequest.updateSessionRules`.
- **Strict Scope:** Headers are stripped **ONLY** on:
  1. `resourceTypes: ["sub_frame"]` (never top-level page navigations).
  2. URLs matching strictly local-dev hosts: `localhost`, `127.0.0.1`, `[::1]`, and `*.localhost`.
- **Session-Only Lifecycle:** The rules are stored in memory by Chrome for the current browser session and are automatically cleaned up when all workspace tabs close. No headers are modified for standard browsing.

---

## 7. Permissions Justification Table

| Permission | Scope / Purpose | Why it is strictly required |
| :--- | :--- | :--- |
| `declarativeNetRequest` | Session rules | Strips `X-Frame-Options` and `Content-Security-Policy` sub_frame headers on localhost so dev servers can be embedded in the workspace. |
| `storage` | Local storage | Stores device layout preferences per origin, webhook request history, and test signing secrets locally. |
| `activeTab` | Active tab query | Detects the active tab's URL when the extension action icon is clicked to pre-populate the workspace URL. |
| `tabs` | Tab management | Opens and focuses the dedicated `workspace.html` tab and captures workspace screenshots. |
| `host_permissions` | `http://localhost/*`, `http://127.0.0.1/*`, `http://[::1]/*`, `http://*.localhost/*` (and `https://` equivalents) | Enables content script injection (`frame-agent.js`) and direct HTTP webhook dispatching to local development servers without CORS restrictions. |

*Note: The extension requests ZERO permissions for public internet domains (`<all_urls>` is NEVER requested).*

---

## 8. Known Technical Limitations & Mitigations

1. **JavaScript Frame-Busting (`window.top !== window.self`):**
   - *Limitation:* If an application includes explicit JavaScript code that redirects when `window.top !== window.self`, headers cannot prevent this script from executing.
   - *Mitigation:* The extension applies the iframe `sandbox` attribute (`allow-scripts allow-forms allow-same-origin allow-modals allow-popups`) without `allow-top-navigation`, preventing child iframes from navigating the parent workspace window.
2. **True Device Emulation vs. Responsive Viewport Simulation:**
   - *Limitation:* Viewports simulate accurate CSS pixel dimensions, DPR scaling, and media queries. They do not simulate native mobile GPU performance or mobile-specific WebKit/Blink engine quirks.
   - *Mitigation:* The extension provides touch simulation and 44px touch-target warnings to catch responsive layout bugs early in development.
3. **Inbound Webhooks from the Public Internet:**
   - *Limitation:* Browser extensions run client-side and cannot open an inbound public TCP port to receive webhooks from external services (e.g. live Stripe servers).
   - *Mitigation:* We provide full HMAC signature simulation for local testing, and include an optional, zero-dependency Node.js companion script (`companion/receiver.js`) to capture webhooks locally or from a developer's chosen tunnel (e.g. ngrok / Cloudflare Tunnel).

---

## 9. Automated Testing & QA Verification

The repository includes a comprehensive unit test suite running on Node.js's native test runner (`node:test`):

```bash
# Run all automated unit tests
npm test
```

### Test Coverage Summary:
- **`test/scroll.test.js`:** Document scroll-percentage math, boundary conditions (0%, 50%, 100%), and follower target pixel reconstruction across varying viewport heights.
- **`test/protocol.test.js`:** Envelope creation, version contracts, channel token security enforcement, and malformed payload rejection.
- **`test/signatures.test.js`:** Web Crypto API HMAC-SHA256 hex/base64 calculations verified against Node's `node:crypto` reference implementations for Stripe, GitHub, Shopify, and generic endpoints.
- **`test/templates.test.js`:** Dynamic variable substitution (`{{timestamp}}`, `{{iso_timestamp}}`, `{{uuid}}`, `{{random_int}}`, `{{random_email}}`) and JSON validity across all 10 built-in templates.
- **`test/devices.test.js`:** Preset library integrity, portrait/landscape rotation math, and Tailwind / Bootstrap breakpoint calculations.
- **`test/locator.test.js`:** Composite locator generation, resilient test ID extraction, dynamic numeric ID filtering, and DOM visibility evaluation.

---

## 10. Chrome Web Store Listing Copy & Policy Draft

### Store Listing Details:
- **Title:** Localhost Multi-View & Webhook Inspector
- **Short Description (under 132 chars):** Synchronized responsive multi-viewport testing and local webhook inspector for localhost web development.
- **Single-Purpose Statement:** "Local web development testing tools for responsive layouts and local webhook integrations."

### Single-Purpose Review Risk Analysis & Split Proposal:
- *Risk:* The Chrome Web Store team strictly enforces a single-purpose policy. Combining multi-view viewport testing and webhook inspection could potentially be flagged as two distinct utilities.
- *Mitigation & Split Architecture:* The codebase is engineered in clean, modular directories (`workspace/`, `webhooks/`, `shared/`). If required by Web Store review, the codebase cleanly separates into two standalone extensions sharing `shared/`:
  1. `Localhost Multi-View Inspector` (Manifest with `workspace/`, `content/`, and `shared/`)
  2. `Localhost Webhook Inspector` (Manifest with `webhooks/`, `devtools/`, and `shared/`)

### Privacy Policy Draft (for Chrome Web Store):
> **Privacy Policy for Localhost Multi-View & Webhook Inspector**
>
> 1. **Zero Data Collection:** Localhost Multi-View & Webhook Inspector does not collect, transmit, track, or sell any personal data, usage analytics, or browsing history.
> 2. **Local-Only Execution:** All synchronization and webhook operations execute 100% locally on the user's computer. The extension makes zero remote network requests to third-party servers.
> 3. **Restricted Host Permissions:** Network access is strictly restricted to local development origins (`localhost`, `127.0.0.1`, `[::1]`, and `*.localhost`).
> 4. **Local Storage:** All user configurations, device presets, webhook history, and test signing secrets are stored locally on your device via `chrome.storage.local` and can be cleared at any time via the Options page.

---

## 11. Optional Pro / Tip-Jar Roadmap

*(Future enhancements that preserve our 100% local, privacy-first commitment; no payments or external tracking in v1)*:

1. **Playwright & Cypress Viewport Config Export:** One-click export of current viewport dimensions and breakpoints into ready-to-run Playwright (`playwright.config.ts`) and Cypress configuration files.
2. **Team-Shareable Device Packs:** Export and import custom device viewport collections as local JSON files for engineering team standardization.
3. **Dark / Light Mode & High-Contrast Media Simulation:** Rapid toggling of `prefers-color-scheme` and `prefers-reduced-motion` inside framed pages.
4. **HAR File Replay:** Replay recorded HTTP archives against local webhook endpoints.
