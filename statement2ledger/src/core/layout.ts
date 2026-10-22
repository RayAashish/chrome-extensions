/**
 * Statement2Ledger - PDF Layout Analysis & Positional Text Clustering
 * 
 * Rebuilds tabular rows from raw pdf.js text items with (x, y) coordinates.
 * Clusters items on Y (with tolerance), detects column headers on X, handles
 * multi-line narrations, and provides privacy-safe anonymized layout export.
 */

import { ColumnBounds, PdfRowCluster, PdfTextItem } from '../types';
import { extractDateFromCell, parseIndianDate } from './dates';

// Standard line height clustering tolerance in points (pt)
const Y_CLUSTER_TOLERANCE = 5.5;

/**
 * Clusters raw pdf.js text items on the Y-axis into coherent horizontal lines.
 */
export function clusterTextItemsIntoRows(items: PdfTextItem[], pageNumber: number): PdfRowCluster[] {
  if (!items || items.length === 0) return [];

  // Filter out completely blank items
  const cleanItems = items.filter((item) => item.str && item.str.trim().length > 0);

  // Group items by Y coordinate
  const rows: { y: number; items: PdfTextItem[] }[] = [];

  for (const item of cleanItems) {
    let matchedRow = false;
    for (const row of rows) {
      if (Math.abs(row.y - item.y) <= Y_CLUSTER_TOLERANCE) {
        row.items.push(item);
        matchedRow = true;
        break;
      }
    }
    if (!matchedRow) {
      rows.push({ y: item.y, items: [item] });
    }
  }

  // Sort rows from top of the page to bottom of the page (descending Y in standard PDF coordinates)
  rows.sort((a, b) => b.y - a.y);

  // Sort items within each row horizontally from left to right (ascending X)
  const clusters: PdfRowCluster[] = rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    const fullText = r.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    return {
      y: r.y,
      items: r.items,
      fullText,
      pageNumber
    };
  });

  return clusters;
}

/**
 * Splits items within a row cluster into column cells by detecting horizontal space gaps (>= 12pt).
 * Provides clean column separation even if header row boundaries are not yet known.
 */
export function partitionClusterItemsIntoCells(cluster: PdfRowCluster): string[] {
  const items = cluster.items;
  if (!items || items.length === 0) return [cluster.fullText];

  const cells: string[] = [];
  let currentCell = items[0].str;
  let prevRight = items[0].x + items[0].width;

  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    const gap = it.x - prevRight;

    // If gap between adjacent text items is >= 10pt, start a new table cell
    if (gap >= 10.0) {
      cells.push(currentCell.trim());
      currentCell = it.str;
    } else {
      currentCell += (gap > 1 ? ' ' : '') + it.str;
    }
    prevRight = Math.max(prevRight, it.x + it.width);
  }

  if (currentCell.trim()) {
    cells.push(currentCell.trim());
  }

  return cells.length > 0 ? cells : [cluster.fullText];
}

/**
 * Detects whether a clustered line is a bank statement transaction table header.
 */
export function isHeaderRow(text: string): boolean {
  const upper = text.toUpperCase();
  const hasDate = upper.includes('DATE') || upper.includes('DT') || upper.includes('TRANSACTION DATE') || upper.includes('TXN');
  const hasNarration =
    upper.includes('NARRATION') ||
    upper.includes('PARTICULAR') ||
    upper.includes('DESCRIPTION') ||
    upper.includes('REMARK') ||
    upper.includes('DETAIL');
  const hasAmountOrBal =
    upper.includes('WITHDRAWAL') ||
    upper.includes('DEPOSIT') ||
    upper.includes('DEBIT') ||
    upper.includes('CREDIT') ||
    upper.includes('AMOUNT') ||
    upper.includes('BALANCE') ||
    upper.includes('CLOSING') ||
    upper.includes('BAL') ||
    /\b(DR|CR)\b/.test(upper);

  return hasDate && (hasNarration || hasAmountOrBal);
}

/**
 * Detects column bounding intervals (minX, maxX) from the header row items.
 */
export function detectColumnBoundsFromHeader(headerCluster: PdfRowCluster): ColumnBounds[] {
  const items = headerCluster.items;
  if (items.length === 0) return [];

  // Group nearby header words into column titles (e.g. "Value" + "Date" -> "Value Date")
  const mergedHeaders: { name: string; minX: number; maxX: number }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prev = mergedHeaders[mergedHeaders.length - 1];

    // If close horizontally (< 15pt), merge into previous header word
    if (prev && item.x - prev.maxX < 18) {
      prev.name += ' ' + item.str;
      prev.maxX = Math.max(prev.maxX, item.x + item.width);
    } else {
      mergedHeaders.push({
        name: item.str,
        minX: item.x,
        maxX: item.x + item.width
      });
    }
  }

  // Define column intervals with mid-points between adjacent headers
  const bounds: ColumnBounds[] = [];
  for (let i = 0; i < mergedHeaders.length; i++) {
    const curr = mergedHeaders[i];
    const prev = mergedHeaders[i - 1];
    const next = mergedHeaders[i + 1];

    const leftBoundary = prev ? (prev.maxX + curr.minX) / 2 : 0;
    const rightBoundary = next ? (curr.maxX + next.minX) / 2 : 1000;

    bounds.push({
      name: curr.name.trim(),
      minX: leftBoundary,
      maxX: rightBoundary
    });
  }

  return bounds;
}

/**
 * Assigns items in a row cluster into column cells based on detected column X boundaries.
 */
export function assignRowItemsToColumns(
  rowCluster: PdfRowCluster,
  bounds: ColumnBounds[]
): Record<string, string> {
  const cells: Record<string, string[]> = {};
  for (const b of bounds) {
    cells[b.name] = [];
  }

  for (const item of rowCluster.items) {
    const itemMidX = item.x + item.width / 2;
    // Find matching column
    let matched = false;
    for (const b of bounds) {
      if (itemMidX >= b.minX && itemMidX < b.maxX) {
        cells[b.name].push(item.str);
        matched = true;
        break;
      }
    }
    // Fallback: assign to closest column
    if (!matched && bounds.length > 0) {
      let closestCol = bounds[0];
      let minDistance = 999999;
      for (const b of bounds) {
        const colCenter = (b.minX + b.maxX) / 2;
        const dist = Math.abs(colCenter - itemMidX);
        if (dist < minDistance) {
          minDistance = dist;
          closestCol = b;
        }
      }
      cells[closestCol.name].push(item.str);
    }
  }

  const result: Record<string, string> = {};
  for (const [colName, parts] of Object.entries(cells)) {
    result[colName] = parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return result;
}

/**
 * Filters out noise rows such as page numbers, summary blocks, and disclaimers.
 */
export function isNoiseOrSummaryRow(lineText: string): boolean {
  const upper = lineText.toUpperCase();

  // 1. Page numbering (e.g. "Page 1 of 56", "Page No : 1")
  if (/\bPAGE\s+(\d+|NO\.?)\b/i.test(upper)) return true;
  if (/^PAGE\s+\d+\s+(OF|\/)\s+\d+/i.test(upper)) return true;

  // 2. Carried Forward / Brought Forward subtotal rows across page breaks
  if (
    upper.includes('CARRIED FORWARD') ||
    upper.includes('BROUGHT FORWARD') ||
    /\b(B\/F|C\/F)\b/.test(upper) ||
    upper.includes('BALANCE B/F') ||
    upper.includes('BALANCE C/F')
  ) {
    return true;
  }

  // 3. Statement metadata headers & footers
  if (
    upper.includes('STATEMENT SUMMARY') ||
    upper.includes('TOTAL DEPOSIT') ||
    upper.includes('TOTAL WITHDRAWAL') ||
    upper.includes('STATEMENT PERIOD') ||
    upper.includes('GENERATED ON') ||
    upper.includes('PRINTED ON') ||
    upper.includes('COMPUTER GENERATED') ||
    upper.includes('DO NOT REQUIRE SIGNATURE') ||
    upper.includes('REGISTERED OFFICE') ||
    upper.includes('END OF STATEMENT')
  ) {
    return true;
  }

  // If line contains a valid date, it is a transaction row and must NOT be filtered!
  if (extractDateFromCell(lineText)) return false;

  return false;
}

/**
 * Produces a privacy-safe anonymized layout skeleton for bug reporting.
 * All digits -> 9, uppercase letters -> A, lowercase -> a, numbers and names stripped,
 * but coordinates, lengths, and layout geometry are preserved.
 */
export function generateAnonymizedLayout(clusters: PdfRowCluster[]): string {
  const lines: string[] = [];
  lines.push('=== STATEMENT2LEDGER ANONYMIZED LAYOUT SKELETON ===');
  lines.push('# Privacy note: All PII, amounts, and names are replaced with 9/A/a placeholders.');
  lines.push('# Only spatial alignment, row coordinates, and column structure are shown below.');
  lines.push('');

  for (const cluster of clusters) {
    const maskedText = cluster.fullText
      .replace(/[0-9]/g, '9')
      .replace(/[A-Z]/g, 'A')
      .replace(/[a-z]/g, 'a');

    const itemCoords = cluster.items
      .map((it) => `[x=${Math.round(it.x)},w=${Math.round(it.width)}]`)
      .join(' ');

    lines.push(`P${cluster.pageNumber} Y=${Math.round(cluster.y)}: ${maskedText}`);
    lines.push(`   Coords: ${itemCoords}`);
  }

  return lines.join('\n');
}
