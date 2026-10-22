import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Generate valid RGBA PNG files without any third-party dependencies
function createPngBuffer(width, height) {
  // Simple PNG header and chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // Color type 6: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image raster data with scanline filter bytes
  const bytesPerPixel = 4;
  const rowSize = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * bytesPerPixel;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Shield gradient (Deep blue to vibrant blue)
        const t = (y / height);
        const r = Math.round(30 + 30 * t);
        const g = Math.round(110 + 20 * t);
        const b = Math.round(230 - 20 * t);

        // Center lock emblem in white/green
        if (Math.abs(dx) <= radius * 0.45 && Math.abs(dy) <= radius * 0.45) {
          if (dist <= radius * 0.15) {
            // Emerald keyhole
            rawData[px] = 16;
            rawData[px + 1] = 185;
            rawData[px + 2] = 129;
            rawData[px + 3] = 255;
          } else {
            // White lock body
            rawData[px] = 255;
            rawData[px + 1] = 255;
            rawData[px + 2] = 255;
            rawData[px + 3] = 255;
          }
        } else {
          rawData[px] = r;
          rawData[px + 1] = g;
          rawData[px + 2] = b;
          rawData[px + 3] = 255;
        }
      } else {
        // Transparent outside shield
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      }
    }
  }

  const compressedData = deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// CRC32 table & calculator
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Generate 16, 32, 48, 128 icons
const sizes = [16, 32, 48, 128];
const iconsDir = join(process.cwd(), 'icons');

for (const size of sizes) {
  const buf = createPngBuffer(size, size);
  const filename = join(iconsDir, `icon${size}.png`);
  writeFileSync(filename, buf);
  console.log(`Generated ${filename} (${size}x${size}, ${buf.length} bytes)`);
}
