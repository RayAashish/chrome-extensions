#!/usr/bin/env node

/**
 * Zero-dependency PNG icon generator using Node.js built-in zlib.
 * Generates valid PNG icon files (16, 32, 48, 128 px) for the extension.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function calculateCrc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crc = calculateCrc(crcPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, crcPayload, crcBuf]);
}

function generateIconPng(size) {
  // RGBA buffer for size x size
  const rawBytes = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    rawBytes[offset++] = 0; // Filter byte: None

    for (let x = 0; x < size; x++) {
      // Calculate normalized coordinates
      const nx = x / size;
      const ny = y / size;

      // Base background: Dark navy (#0f172a)
      let r = 15;
      let g = 23;
      let b = 42;
      let a = 255;

      // Rounded outer border
      const margin = 0.08;
      if (nx < margin || nx > (1 - margin) || ny < margin || ny > (1 - margin)) {
        r = 30; g = 41; b = 59;
      }

      // Responsive screen shapes
      // Desktop frame (upper half)
      if (nx >= 0.2 && nx <= 0.8 && ny >= 0.2 && ny <= 0.6) {
        r = 56; g = 189; b = 248; // Cyan / Light blue
      }

      // Mobile frame (lower left)
      if (nx >= 0.22 && nx <= 0.45 && ny >= 0.45 && ny <= 0.85) {
        r = 37; g = 99; b = 235; // Blue
      }

      // Webhook lightning bolt (diagonal accent)
      if (nx >= 0.6 && nx <= 0.85 && ny >= 0.15 && ny <= 0.55 && Math.abs((nx - 0.72) + (ny - 0.35)) < 0.12) {
        r = 245; g = 158; b = 11; // Amber yellow
      }

      rawBytes[offset++] = r;
      rawBytes[offset++] = g;
      rawBytes[offset++] = b;
      rawBytes[offset++] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // Deflate compression
  ihdrData[11] = 0; // Filter method
  ihdrData[12] = 0; // No interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawBytes, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const sizes = [16, 32, 48, 128];
sizes.forEach(sz => {
  const pngBuffer = generateIconPng(sz);
  const outPath = path.join(__dirname, `icon-${sz}.png`);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`✓ Generated icon-${sz}.png (${pngBuffer.length} bytes)`);
});
