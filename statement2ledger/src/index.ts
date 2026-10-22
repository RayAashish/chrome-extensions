/**
 * Statement2Ledger - Application Bootstrapper
 */

import './styles/app.css';
import { App } from './ui/app';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();

  // Register service worker for offline PWA operation
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }
});
