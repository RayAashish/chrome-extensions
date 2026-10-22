#!/usr/bin/env node

/**
 * Optional Local Webhook Receiver Companion
 * Single-file, zero-dependency Node.js HTTP listener.
 * Captures incoming HTTP webhooks on localhost (or forwarded via ngrok/Cloudflare),
 * stores them in-memory, and provides an API for local inspection.
 *
 * Usage:
 *   node companion/receiver.js [port]
 * Default port: 9999
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = parseInt(process.argv[2], 10) || 9999;
const HOST = '127.0.0.1'; // Strictly localhost only

const capturedEvents = [];
const MAX_EVENTS = 100;
const serverSecretToken = crypto.randomBytes(16).toString('hex');

const server = http.createServer((req, res) => {
  // Set CORS headers so extension pages and local tools can query events
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: PORT, uptime: process.uptime() }));
    return;
  }

  // API to retrieve captured events
  if (req.url === '/api/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: capturedEvents.length, events: capturedEvents }));
    return;
  }

  // API to clear captured events
  if (req.url === '/api/clear' && (req.method === 'POST' || req.method === 'DELETE')) {
    capturedEvents.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Events cleared' }));
    return;
  }

  // General Inbound Webhook Handler: Captures any POST/PUT/PATCH/GET request
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      // Raw text or form
    }

    const eventRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: rawBody,
      parsedBody
    };

    capturedEvents.unshift(eventRecord);
    if (capturedEvents.length > MAX_EVENTS) {
      capturedEvents.pop();
    }

    const timeStr = new Date().toLocaleTimeString();
    console.log(`[${timeStr}] 📩 Captured ${req.method} ${req.url} (${rawBody.length} bytes)`);

    // Log provider signature headers if present
    if (req.headers['stripe-signature']) {
      console.log(`       ↳ Stripe-Signature: ${req.headers['stripe-signature'].slice(0, 32)}...`);
    }
    if (req.headers['x-hub-signature-256']) {
      console.log(`       ↳ GitHub Signature: ${req.headers['x-hub-signature-256']}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'received',
      id: eventRecord.id,
      timestamp: eventRecord.isoTimestamp,
      totalCaptured: capturedEvents.length
    }));
  });
});

server.listen(PORT, HOST, () => {
  console.log('\n==========================================================');
  console.log('⚡ Localhost Webhook Receiver Companion Online');
  console.log(`📡 Listening on: http://${HOST}:${PORT}`);
  console.log(`🩺 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📋 Events API:   http://${HOST}:${PORT}/api/events`);
  console.log('==========================================================');
  console.log('ℹ️  Tip: Point your local webhook dispatcher (or ngrok tunnel)');
  console.log(`   to http://localhost:${PORT}/webhook\n`);
});
