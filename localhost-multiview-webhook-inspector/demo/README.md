# Demo Testbed Application

This directory contains a complete local development testbed specifically designed to verify all 7 acceptance criteria of the **Localhost Multi-View & Webhook Inspector** extension.

## What is Included:

1. **Frontend App (`index.html`) on Port 3000:**
   - **Signup form with controlled inputs:** Name, email, plan tier, terms checkbox, and submit button. Bound to a live preview component that updates upon typing in real time.
   - **Desktop-only sidebar:** Contains `Dashboard`, `Analytics`, and `Settings` (`data-testid="nav-settings"`). On mobile viewports (<768px), the sidebar collapses to a hamburger menu, making `Settings` hidden.
   - **Deliberate horizontal overflow table:** A fixed 600px-wide data table that overflows by >200px on mobile screens (iPhone 15 width: 393px).
   - **Long scrollable document:** Over 2000px high with anchor blocks to verify scroll percentage synchronization.
   - **Strict headers:** Sends `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` to prove our DeclarativeNetRequest session rules strip them cleanly.

2. **Webhook Echo Endpoint on Port 8080:**
   - Listens on `http://localhost:8080/api/webhooks/stripe`, `http://localhost:8080/api/webhooks/github`, etc.
   - Echoes received headers, valid signatures, and parsed payload back as JSON.

## Running the Demo

Run both servers with a single command:

```bash
node demo/server.js
```

Then open `http://localhost:3000` in Google Chrome and click the extension icon to launch the Multi-View Workspace.
