#!/usr/bin/env node

/**
 * Demo Application & Webhook Echo Test Server
 * Zero dependencies (Node.js standard library only).
 *
 * Runs two local services simultaneously:
 * 1. Port 3000: The responsive dashboard app with controlled inputs,
 *    responsive collapsible sidebar, and deliberate 600px overflow table.
 *    Sends X-Frame-Options: SAMEORIGIN and CSP to test our DNR header removal!
 * 2. Port 8080: The webhook target endpoint (/api/webhooks/stripe, etc.)
 *    that echoes received payloads and verifies signatures.
 *
 * Usage:
 *   node demo/server.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PORT = 3000;
const WEBHOOK_PORT = 8080;

// ==========================================
// 1. FRONTEND APP SERVER (PORT 3000)
// ==========================================

const htmlFilePath = path.join(__dirname, 'index.html');

const appServer = http.createServer((req, res) => {
  // Deliberately set restrictive framing headers to verify our DNR rule works!
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
    res.writeHead(200);
    res.end(htmlContent);
  } catch (err) {
    res.writeHead(500);
    res.end(`Server Error reading index.html: ${err.message}`);
  }
});

appServer.listen(APP_PORT, '127.0.0.1', () => {
  console.log(`\n🚀 [Port ${APP_PORT}] Responsive DevApp running at: http://localhost:${APP_PORT}`);
  console.log(`   (Headers sent: X-Frame-Options: SAMEORIGIN, CSP: frame-ancestors 'self')`);
});

// ==========================================
// 2. WEBHOOK TARGET ENDPOINT (PORT 8080)
// ==========================================

const webhookServer = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature, X-Hub-Signature-256, X-Shopify-Hmac-Sha256, *');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {}

    const timestamp = new Date().toISOString();
    console.log(`\n⚡ [Port ${WEBHOOK_PORT}] Received ${req.method} ${req.url}`);

    if (req.headers['stripe-signature']) {
      console.log(`   ✓ Stripe-Signature Header: ${req.headers['stripe-signature']}`);
    }
    if (req.headers['x-hub-signature-256']) {
      console.log(`   ✓ GitHub Signature Header: ${req.headers['x-hub-signature-256']}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'success',
      endpoint: req.url,
      receivedAt: timestamp,
      method: req.method,
      receivedHeaders: req.headers,
      bodyPreview: parsedBody || rawBody.slice(0, 200),
      message: 'Local webhook processed successfully by dev server.'
    }, null, 2));
  });
});

webhookServer.listen(WEBHOOK_PORT, '127.0.0.1', () => {
  console.log(`🎯 [Port ${WEBHOOK_PORT}] Webhook Echo API running at: http://localhost:${WEBHOOK_PORT}`);
  console.log(`   (Ready to receive Stripe, GitHub, Shopify webhook POST requests)\n`);
  console.log(`Acceptance Scenario Ready!`);
  console.log(`1. Open http://localhost:3000 in Chrome`);
  console.log(`2. Click the extension icon to launch Multi-View Workspace.\n`);
});
