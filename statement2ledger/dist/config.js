/**
 * Statement2Ledger - Global App Configuration
 * This file contains configurable runtime values such as tip jar links and limits.
 * Privacy note: No telemetry or analytics endpoints can be configured here.
 */
window.__APP_CONFIG__ = {
  appName: "Statement2Ledger",
  version: "1.0.0",
  // Tip Jar / Support Configuration
  // Used strictly after a user downloads their ledger.
  support: {
    enabled: true,
    title: "Buy me a chai",
    message: "Statement2Ledger processed 100% on your device. Saved you an hour? Support open source development.",
    // Configurable VPA for client-side local QR rendering:
    upiVpa: "statement2ledger@upi",
    payeeName: "Statement2Ledger Open Source",
    // External support URL (plain clicked link with noopener noreferrer):
    supportUrl: "https://github.com/sponsors/statement2ledger",
    suggestedAmounts: [50, 100, 200, 500]
  },
  // Document Limits for client-side safety:
  limits: {
    maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
    maxPagesPerDocument: 600
  },
  defaults: {
    maskSensitiveInfo: true // Mask account number (last 4 digits) and customer name in exports
  }
};
