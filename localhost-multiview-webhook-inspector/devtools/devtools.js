/**
 * DevTools Page Script
 * Registers the "Local Inspector" DevTools panel.
 */

chrome.devtools.panels.create(
  'Local Inspector',
  '../icons/icon-16.png',
  'panel.html',
  panel => {
    // Panel initialized
  }
);
