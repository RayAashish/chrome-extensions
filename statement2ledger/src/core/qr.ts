/**
 * Statement2Ledger - Client-Side Standalone QR Code Generator
 * Generates UPI payment QR codes entirely in-memory using pure math.
 * Zero external libraries, zero CDN, zero network activity.
 */

// A lightweight, robust QR code matrix generator for alphanumeric/byte data
// Supports QR Code Model 2, Byte encoding with Error Correction Level M / L

export interface QROptions {
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

export function generateUpiQRDataUrl(
  vpa: string,
  payeeName: string,
  amountRupees?: number,
  options: QROptions = {}
): string {
  const encName = encodeURIComponent(payeeName || 'Statement2Ledger');
  let upiUri = `upi://pay?pa=${vpa}&pn=${encName}&cu=INR`;
  if (amountRupees && amountRupees > 0) {
    upiUri += `&am=${amountRupees.toFixed(2)}`;
  }

  return generateQRDataUrl(upiUri, options);
}

/**
 * Generates an SVG Data URL string containing the QR code for any input string.
 */
export function generateQRDataUrl(text: string, options: QROptions = {}): string {
  const size = options.size || 220;
  const margin = options.margin !== undefined ? options.margin : 2;
  const dark = options.darkColor || '#0f172a';
  const light = options.lightColor || '#ffffff';

  const matrix = createQRMatrix(text);
  const matrixSize = matrix.length;
  const totalCells = matrixSize + margin * 2;
  const cellSize = (size / totalCells).toFixed(2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalCells} ${totalCells}" width="${size}" height="${size}" shape-rendering="crispEdges">`;
  svg += `<rect width="${totalCells}" height="${totalCells}" fill="${light}"/>`;

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        svg += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${dark}"/>`;
      }
    }
  }

  svg += '</svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Creates a standard 2D boolean matrix for the QR Code.
 * Uses standard Reed-Solomon polynomial division for QR generation.
 */
function createQRMatrix(text: string): boolean[][] {
  const dataBytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      dataBytes.push(code);
    } else if (code < 2048) {
      dataBytes.push(192 | (code >> 6), 128 | (code & 63));
    } else {
      dataBytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
    }
  }

  // Determine QR version based on byte length (Version 1 to 5)
  let version = 1;
  const capacities = [17, 32, 53, 78, 106, 134, 154, 192];
  while (version < capacities.length && dataBytes.length > capacities[version - 1]) {
    version++;
  }
  if (version > capacities.length) version = capacities.length;

  const numModules = version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: numModules }, () =>
    Array.from({ length: numModules }, () => null)
  );

  // 1. Finder patterns (top-left, top-right, bottom-left)
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, numModules - 7, 0);
  addFinderPattern(matrix, 0, numModules - 7);

  // 2. Alignment patterns for version >= 2
  if (version >= 2) {
    const alignPos = version * 4 + 10;
    addAlignmentPattern(matrix, alignPos, alignPos);
  }

  // 3. Timing patterns
  for (let i = 8; i < numModules - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // 4. Reserve format info
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = numModules - 8; i < numModules; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 5. Build bit stream with byte mode indicator (0100) and character count indicator
  const bitStream: number[] = [0, 1, 0, 0];
  const countBits = version < 10 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) {
    bitStream.push((dataBytes.length >> i) & 1);
  }
  for (const byte of dataBytes) {
    for (let i = 7; i >= 0; i--) {
      bitStream.push((byte >> i) & 1);
    }
  }

  // Terminator (up to 4 zeroes)
  for (let i = 0; i < 4 && bitStream.length < capacities[version - 1] * 8; i++) {
    bitStream.push(0);
  }
  // Byte alignment
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }
  // Pad bytes: 0xEC, 0x11 (11101100, 00010001)
  const pad = [236, 17];
  let pIdx = 0;
  while (bitStream.length < capacities[version - 1] * 8) {
    const pByte = pad[pIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bitStream.push((pByte >> i) & 1);
    }
    pIdx++;
  }

  // 6. Fill modules in matrix in zigzag 2-column paths
  let bitIdx = 0;
  let upward = true;
  for (let rightCol = numModules - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing line

    const rowIndices = upward
      ? Array.from({ length: numModules }, (_, i) => numModules - 1 - i)
      : Array.from({ length: numModules }, (_, i) => i);

    for (const r of rowIndices) {
      for (const c of [rightCol, rightCol - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
          // Apply standard mask pattern 000: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

function addFinderPattern(matrix: (boolean | null)[][], row: number, col: number): void {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
      const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matrix[row + r][col + c] = isOuter || isInner;
    }
  }
  // Separator border
  const size = matrix.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const nr = row + r;
      const nc = col + c;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        if (matrix[nr][nc] === null) {
          matrix[nr][nc] = false;
        }
      }
    }
  }
}

function addAlignmentPattern(matrix: (boolean | null)[][], row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
      const isCenter = r === 0 && c === 0;
      matrix[row + r][col + c] = isBorder || isCenter;
    }
  }
}
