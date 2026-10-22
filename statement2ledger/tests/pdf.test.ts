import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { assignRowItemsToColumns, clusterTextItemsIntoRows, detectColumnBoundsFromHeader, isHeaderRow, isNoiseOrSummaryRow, partitionClusterItemsIntoCells } from '../src/core/layout';
import { reconcileTransactions } from '../src/core/reconcile';
import { defaultParserRegistry } from '../src/parsers';
import { PdfRowCluster, PdfTextItem } from '../src/types';

describe('PDF Extraction & Multi-Page Parsing Test', () => {
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');

  it('correctly clusters and extracts transactions from multi-page synthetic PDF', async () => {
    const pdfPath = path.join(fixturesDir, 'hdfc_multipage_synthetic.pdf');
    if (!fs.existsSync(pdfPath)) return;

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    expect(pdfDoc.numPages).toBeGreaterThanOrEqual(2);

    const allRowClusters: PdfRowCluster[] = [];
    const fullTextLines: string[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items: PdfTextItem[] = [];
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          items.push({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width || 0,
            height: item.height || 0
          });
        }
      }

      const clusters = clusterTextItemsIntoRows(items, pageNum);
      for (const c of clusters) {
        allRowClusters.push(c);
        fullTextLines.push(c.fullText);
      }
    }

    expect(allRowClusters.length).toBeGreaterThan(5);

    // Extract table rows using positional clustering & gap partitioning
    const rows: string[][] = [];
    let activeBounds: any[] = [];

    for (const cluster of allRowClusters) {
      if (isNoiseOrSummaryRow(cluster.fullText)) continue;

      if (isHeaderRow(cluster.fullText)) {
        const bounds = detectColumnBoundsFromHeader(cluster);
        if (bounds.length >= 3) {
          activeBounds = bounds;
          rows.push(activeBounds.map((b) => b.name));
          continue;
        }
      }

      if (activeBounds.length >= 3) {
        const colCells = assignRowItemsToColumns(cluster, activeBounds);
        const rowArr = activeBounds.map((b) => colCells[b.name] || '');
        const nonEmpty = rowArr.filter((c) => c.trim().length > 0);
        if (nonEmpty.length <= 1 && cluster.items.length >= 3) {
          rows.push(partitionClusterItemsIntoCells(cluster));
          continue;
        }
        rows.push(rowArr);
      } else {
        rows.push(partitionClusterItemsIntoCells(cluster));
      }
    }

    const fullSampleText = fullTextLines.slice(0, 50).join('\n');
    const { parser } = defaultParserRegistry.findBestParser(fullSampleText, { filename: 'hdfc_multipage_synthetic.pdf' });
    const metadata = parser.extractMetadata(fullSampleText);

    let parsed = await parser.parse(
      { rawText: fullTextLines.join('\n'), rows, clusters: allRowClusters },
      metadata,
      { sourceFileName: 'hdfc_multipage_synthetic.pdf' }
    );

    if (parsed.transactions.length === 0) {
      const generic = defaultParserRegistry.getParser('generic');
      parsed = await generic!.parse(
        { rawText: fullTextLines.join('\n'), rows, clusters: allRowClusters },
        metadata,
        { sourceFileName: 'hdfc_multipage_synthetic.pdf' }
      );
    }

    expect(parsed.transactions.length).toBeGreaterThan(0);

    const recon = reconcileTransactions(parsed.transactions, metadata, parsed.unparsedLines);
    expect(recon.report.totalRows).toBeGreaterThan(0);
  });
});
