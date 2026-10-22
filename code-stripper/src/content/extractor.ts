import { adjustClassificationWithHint, classifySnippet } from '../core/classifier';
import { ExtractedSnippet, ExtractionResult, PageRawExtraction, RawBlock } from '../types';

/**
 * Robust DOM extraction and cleaning engine.
 * Strips syntax highlighter gutters, line numbers, copy buttons, and extracts clean code blocks
 * along with their nearest preceding headings/context hints.
 */

/**
 * Strips numeric gutters / line numbers if they are baked directly into the plain text.
 */
export function stripRawTextLineNumbers(raw: string): string {
  const lines = raw.split('\n');
  if (lines.length < 2) return raw;

  // Pattern 1: "1 | code" or " 12 | code" - preserve indentation after pipe
  const pipePattern = /^\s*\d{1,4}\s*\| ?(.*)$/;
  // Pattern 2: "1: code" or "01: code" - preserve indentation after colon
  const colonPattern = /^\s*\d{1,4}: ?(.*)$/;
  // Pattern 3: "1  code" where number is separated by gutter spaces
  const spacedPattern = /^\s*\d{1,4}  (.*)$/;

  let pipeMatches = 0;
  let colonMatches = 0;
  let spacedMatches = 0;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (pipePattern.test(line)) pipeMatches++;
    if (colonPattern.test(line)) colonMatches++;
    if (spacedPattern.test(line)) spacedMatches++;
  }

  const nonEmptyCount = lines.filter((l) => l.trim().length > 0).length;
  if (nonEmptyCount === 0) return raw;

  if (pipeMatches / nonEmptyCount >= 0.7) {
    return lines.map((line) => (pipePattern.test(line) ? line.replace(pipePattern, '$1') : line)).join('\n');
  }

  if (colonMatches / nonEmptyCount >= 0.7) {
    return lines.map((line) => (colonPattern.test(line) ? line.replace(colonPattern, '$1') : line)).join('\n');
  }

  if (spacedMatches / nonEmptyCount >= 0.7) {
    return lines.map((line) => (spacedPattern.test(line) ? line.replace(spacedPattern, '$1') : line)).join('\n');
  }

  return raw;
}

/**
 * Cleans extracted code: removes zero-width characters, normalizes line endings,
 * and removes excessive leading/trailing blank lines without breaking indentation.
 */
export function cleanCodeText(text: string): string {
  let cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  cleaned = stripRawTextLineNumbers(cleaned);

  // Strip accidental markdown code fence wrappers (```js ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
  }

  const lines = cleaned.split('\n');
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Clones a DOM element and strips extraneous UI elements (copy buttons, line gutters, icons).
 */
export function extractCleanElementText(el: Element): string {
  // 1. Handle SyntaxHighlighter / Baeldung table format
  const table = el.querySelector('table');
  if (table && el.querySelector('.gutter') && el.querySelector('.code')) {
    const codeCells = el.querySelectorAll('td.code, .syntaxhighlighter-code');
    if (codeCells.length > 0) {
      return Array.from(codeCells)
        .map((cell) => cell.textContent || '')
        .join('\n');
    }
  }

  // 2. Handle GitHub Gist embedded tables (.blob-wrapper table)
  const gistTable = el.querySelector('.blob-wrapper table');
  if (gistTable) {
    const codeLines = el.querySelectorAll('.blob-code-inner, td.blob-code');
    if (codeLines.length > 0) {
      return Array.from(codeLines)
        .map((line) => line.textContent || '')
        .join('\n');
    }
  }

  // 3. Clone and prune unwanted elements
  const clone = el.cloneNode(true) as HTMLElement;

  const selectorsToRemove = [
    // Line number gutters in Prism, Highlight.js, etc.
    '.line-numbers-rows',
    '.hljs-ln-numbers',
    '.gutter',
    '.blob-num',
    '.js-line-number',
    // UI controls & buttons
    'button',
    '.copy-button',
    '.copy-code-button',
    '.clipboard-button',
    '.code-toolbar',
    '.toolbar',
    'svg',
    '[aria-label*="Copy" i]',
    '[aria-label*="clipboard" i]',
    '.mac-header',
    '.code-header'
  ];

  for (const selector of selectorsToRemove) {
    const targets = clone.querySelectorAll(selector);
    targets.forEach((t) => t.remove());
  }

  return clone.textContent || '';
}

const FILE_EXT_REGEX =
  /\.(?:java|kt|ts|tsx|js|jsx|yml|yaml|properties|xml|json|toml|py|go|rs|cs|cpp|c|h|sh|bash|sql|html|css|md|env|gradle)$/i;

function isValidFilePath(text: string): boolean {
  if (text.startsWith('http') || text.includes('://') || text.length > 100) return false;
  if (text.includes('/') || text.includes('\\')) {
    return /\.[a-zA-Z0-9]{1,5}$/.test(text) || text.endsWith('.env');
  }
  return FILE_EXT_REGEX.test(text);
}

/**
 * Searches upward and backward through the DOM hierarchy to find the nearest
 * preceding heading tag (h1-h6) or a strong filename hint.
 */
export function findNearestHeadingAndPath(el: Element): { heading: string; explicitPath: string | null } {
  let explicitPath: string | null = null;
  let heading = '';

  // 1. Check container attributes (e.g., data-filename, data-title, data-path)
  const container = el.closest('[data-filename], [data-title], [data-path], figure');
  if (container) {
    const attrPath =
      container.getAttribute('data-filename') ||
      container.getAttribute('data-path') ||
      container.getAttribute('data-title');
    if (attrPath && isValidFilePath(attrPath)) {
      explicitPath = attrPath.trim();
    }
    const caption = container.querySelector('figcaption');
    if (caption && caption.textContent?.trim()) {
      heading = caption.textContent.trim();
    }
  }

  // 1b. Check if element is inside a ShadowRoot and inspect its shadow host
  let shadowHost: Element | null = null;
  try {
    const rootNode = el.getRootNode ? el.getRootNode() : null;
    if (rootNode && rootNode !== document && (rootNode as ShadowRoot).host) {
      shadowHost = (rootNode as ShadowRoot).host;
    }
  } catch {
    // ignore
  }

  if (shadowHost) {
    const hostPath =
      shadowHost.getAttribute('data-filename') ||
      shadowHost.getAttribute('data-path') ||
      shadowHost.getAttribute('data-title');
    if (hostPath && isValidFilePath(hostPath)) {
      explicitPath = hostPath.trim();
    }
  }

  // 2. Ascend to outer block wrapper if inside Gatsby / Docusaurus
  let current: Element | null = el;
  if (
    current.parentElement &&
    (current.parentElement.classList.contains('gatsby-highlight') ||
      current.parentElement.classList.contains('highlight') ||
      current.parentElement.classList.contains('theme-code-block') ||
      current.parentElement.classList.contains('code-block'))
  ) {
    current = current.parentElement;
  }

  let depth = 0;
  while (current && current !== document.body && depth < 16) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      // If we encounter a preceding code block, stop searching for paragraph hints
      const isCodeSibling =
        sibling.tagName === 'PRE' ||
        sibling.querySelector('pre') ||
        sibling.tagName.toLowerCase() === 'mdn-code-example' ||
        sibling.querySelector('mdn-code-example');

      if (isCodeSibling) {
        if (!heading) {
          const innerHeading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
          if (innerHeading) {
            heading = innerHeading.textContent?.trim() || '';
          }
        }
        break;
      }

      // Direct heading
      if (!heading && /^H[1-6]$/i.test(sibling.tagName)) {
        heading = sibling.textContent?.trim() || '';
        break; // Once we hit a heading, that closes the current section
      }

      // Check if sibling contains an inner heading
      if (!heading) {
        const innerHeading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
        if (innerHeading) {
          heading = innerHeading.textContent?.trim() || '';
          break;
        }
      }

      // Check for inline code tag with file path in sibling
      if (!explicitPath) {
        const codeTags = sibling.querySelectorAll('code, strong, em, b');
        for (const tag of codeTags) {
          const text = tag.textContent?.trim() || '';
          if (isValidFilePath(text)) {
            explicitPath = text;
            break;
          }
        }

        if (!explicitPath) {
          const match = sibling.textContent?.match(
            /(?:file|located at|create|in|path|filename)\s*(?:is|at|in|named)?\s*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)[`'"]?/i
          );
          if (match && match[1] && isValidFilePath(match[1])) {
            explicitPath = match[1];
          }
        }
      }

      sibling = sibling.previousElementSibling;
    }

    if (heading) break;

    // Ascend to parent element. If at top of ShadowRoot, bridge to shadow host in light DOM!
    if (current.parentElement) {
      current = current.parentElement;
    } else {
      try {
        const rootNode: Node | null = typeof current.getRootNode === 'function' ? current.getRootNode() : null;
        if (rootNode && rootNode !== document && (rootNode as ShadowRoot).host) {
          current = (rootNode as ShadowRoot).host;
        } else {
          current = null;
        }
      } catch {
        current = null;
      }
    }
    depth++;
  }

  return { heading, explicitPath };
}

/**
 * Backward compatibility alias for findNearestHeading.
 */
export function findNearestHeading(el: Element): string {
  return findNearestHeadingAndPath(el).heading;
}

/**
 * Standalone in-page extraction function that can be injected directly
 * into any tab via `chrome.scripting.executeScript({ target, func: runInPageExtraction })`.
 * Has ZERO external imports so it executes reliably in isolated page contexts!
 */
export function runInPageExtraction(): PageRawExtraction {
  function stripGutters(raw: string): string {
    const lines = raw.split('\n');
    if (lines.length < 2) return raw;
    const pipePattern = /^\s*\d{1,4}\s*\| ?(.*)$/;
    const colonPattern = /^\s*\d{1,4}: ?(.*)$/;
    const spacedPattern = /^\s*\d{1,4}  (.*)$/;

    let pipeMatches = 0;
    let colonMatches = 0;
    let spacedMatches = 0;
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (pipePattern.test(line)) pipeMatches++;
      if (colonPattern.test(line)) colonMatches++;
      if (spacedPattern.test(line)) spacedMatches++;
    }
    const nonEmpty = lines.filter((l) => l.trim().length > 0).length;
    if (nonEmpty === 0) return raw;

    if (pipeMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (pipePattern.test(l) ? l.replace(pipePattern, '$1') : l)).join('\n');
    }
    if (colonMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (colonPattern.test(l) ? l.replace(colonPattern, '$1') : l)).join('\n');
    }
    if (spacedMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (spacedPattern.test(l) ? l.replace(spacedPattern, '$1') : l)).join('\n');
    }
    return raw;
  }

  function cleanCode(text: string): string {
    let cleaned = text
      .replace(/\r\n/g, '\n')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    cleaned = stripGutters(cleaned);

    // Strip accidental markdown code fence wrappers (```js ... ```)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
    }

    const lines = cleaned.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.join('\n');
  }

  function extractCleanText(el: Element): string {
    const table = el.querySelector('table');
    if (table && el.querySelector('.gutter') && el.querySelector('.code')) {
      const codeCells = el.querySelectorAll('td.code, .syntaxhighlighter-code');
      if (codeCells.length > 0) {
        return Array.from(codeCells).map((c) => c.textContent || '').join('\n');
      }
    }

    const gistTable = el.querySelector('.blob-wrapper table');
    if (gistTable) {
      const lines = el.querySelectorAll('.blob-code-inner, td.blob-code');
      if (lines.length > 0) {
        return Array.from(lines).map((l) => l.textContent || '').join('\n');
      }
    }

    const clone = el.cloneNode(true) as HTMLElement;
    const toRemove = [
      '.line-numbers-rows', '.hljs-ln-numbers', '.gutter', '.blob-num', '.js-line-number',
      'button', '.copy-button', '.copy-code-button', '.clipboard-button', '.code-toolbar',
      '.toolbar', 'svg', '[aria-label*="Copy" i]', '[aria-label*="clipboard" i]',
      '.mac-header', '.code-header'
    ];
    for (const sel of toRemove) {
      clone.querySelectorAll(sel).forEach((t) => t.remove());
    }
    return clone.textContent || '';
  }

  function isValidFilePath(text: string): boolean {
    if (text.startsWith('http') || text.includes('://') || text.length > 100) return false;
    const fileExtPattern =
      /\.(?:java|kt|ts|tsx|js|jsx|yml|yaml|properties|xml|json|toml|py|go|rs|cs|cpp|c|h|sh|bash|sql|html|css|md|env|gradle)$/i;
    if (text.includes('/') || text.includes('\\')) {
      return /\.[a-zA-Z0-9]{1,5}$/.test(text) || text.endsWith('.env');
    }
    return fileExtPattern.test(text);
  }

  function findContext(el: Element): { heading: string; explicitPath: string | null; langHint: string | null } {
    let explicitPath: string | null = null;
    let heading = '';
    let langHint: string | null = null;

    try {
      // 1. Check MDN code-example container (.code-example .example-header .language-name)
      const codeExample = el.closest('.code-example');
      if (codeExample) {
        const langSpan = codeExample.querySelector('.example-header .language-name, .language-name');
        if (langSpan && langSpan.textContent?.trim()) {
          langHint = langSpan.textContent.trim();
        }
      }

      // 2. Check SyntaxHighlighter / MDN brush class (brush: js, brush: java, etc.)
      const preEl = el.tagName.toLowerCase() === 'pre' ? el : el.closest('pre');
      if (preEl) {
        const preClass = typeof preEl.className === 'string' ? preEl.className : (preEl.getAttribute('class') || '');
        const brushMatch = preClass.match(/brush:\s*([a-zA-Z0-9_-]+)/i);
        if (brushMatch && !langHint) {
          langHint = brushMatch[1];
        }
      }

      // 3. Language hint from container data attributes or standard class names
      const langContainer = el.closest(
        '[data-language], [data-lang], [data-code-language], [class*="language-"], [class*="lang-"], [class*="highlight-"]'
      );
      if (langContainer) {
        langHint =
          langHint ||
          langContainer.getAttribute('data-language') ||
          langContainer.getAttribute('data-lang') ||
          langContainer.getAttribute('data-code-language');

        if (!langHint) {
          const cls =
            typeof langContainer.className === 'string'
              ? langContainer.className
              : (langContainer.getAttribute('class') || '');
          const clsMatch = cls.match(/(?:language|lang|highlight)-([a-zA-Z0-9_-]+)/i);
          if (clsMatch && clsMatch[1] !== 'name') {
            langHint = clsMatch[1];
          }
        }
      }

      // 4. Check if el is inside a ShadowRoot and inspect its shadow host (e.g. <mdn-code-example class="brush: js">)
      let shadowHost: Element | null = null;
      try {
        const rootNode = el.getRootNode ? el.getRootNode() : null;
        if (rootNode && rootNode !== document && (rootNode as ShadowRoot).host) {
          shadowHost = (rootNode as ShadowRoot).host;
        }
      } catch {
        // ignore
      }

      if (shadowHost) {
        const hostClass = typeof shadowHost.className === 'string' ? shadowHost.className : (shadowHost.getAttribute('class') || '');
        if (!langHint) {
          const hostBrush = hostClass.match(/brush:\s*([a-zA-Z0-9_-]+)/i);
          if (hostBrush) {
            langHint = hostBrush[1];
          }
        }
        if (!langHint) {
          langHint =
            shadowHost.getAttribute('data-language') ||
            shadowHost.getAttribute('data-lang') ||
            shadowHost.getAttribute('data-code-language');
        }
        if (!langHint) {
          const hostCls = hostClass.match(/(?:language|lang|highlight)-([a-zA-Z0-9_-]+)/i);
          if (hostCls && hostCls[1] !== 'name') {
            langHint = hostCls[1];
          }
        }
        if (!explicitPath) {
          const hostPath =
            shadowHost.getAttribute('data-filename') ||
            shadowHost.getAttribute('data-path') ||
            shadowHost.getAttribute('data-title');
          if (hostPath && isValidFilePath(hostPath)) {
            explicitPath = hostPath.trim();
          }
        }
      }

      // 5. Gist filename in .gist-meta
      const gistFile = el.closest('.gist-file');
      if (gistFile) {
        const metaLink = gistFile.querySelector('.gist-meta a[href*="#file-"]');
        if (metaLink && metaLink.textContent?.trim()) {
          explicitPath = metaLink.textContent.trim();
        }
      }

      // 6. Container data attributes
      const container = el.closest('[data-filename], [data-title], [data-path], figure');
      if (container) {
        const attrPath =
          container.getAttribute('data-filename') ||
          container.getAttribute('data-path') ||
          container.getAttribute('data-title');
        if (attrPath && isValidFilePath(attrPath)) {
          explicitPath = attrPath.trim();
        }
        const caption = container.querySelector('figcaption');
        if (caption && caption.textContent?.trim()) {
          heading = caption.textContent.trim();
        }
      }

      // 7. Ascend to outer block wrapper if inside Gatsby / Docusaurus
      let current: Element | null = el;
      if (
        current.parentElement &&
        (current.parentElement.classList.contains('gatsby-highlight') ||
          current.parentElement.classList.contains('highlight') ||
          current.parentElement.classList.contains('theme-code-block') ||
          current.parentElement.classList.contains('code-block'))
      ) {
        current = current.parentElement;
      }

      let depth = 0;
      while (current && current !== document.body && depth < 16) {
        let sibling = current.previousElementSibling;
        while (sibling) {
          // If we hit a preceding code block, stop searching
          const isCodeSibling =
            sibling.tagName === 'PRE' ||
            sibling.querySelector('pre') ||
            sibling.tagName.toLowerCase() === 'mdn-code-example' ||
            sibling.querySelector('mdn-code-example');

          if (isCodeSibling) {
            if (!heading) {
              const innerHeading = sibling.querySelector('h1, h2, h3, h4, h5, h6');
              if (innerHeading) {
                heading = innerHeading.textContent?.trim() || '';
              }
            }
            break;
          }

          if (!heading && /^H[1-6]$/i.test(sibling.tagName)) {
            heading = sibling.textContent?.trim() || '';
            break;
          }

          if (!heading) {
            const innerH = sibling.querySelector('h1, h2, h3, h4, h5, h6');
            if (innerH) {
              heading = innerH.textContent?.trim() || '';
              break;
            }
          }

          if (!explicitPath) {
            const codeTags = sibling.querySelectorAll('code, strong, em, b');
            for (const tag of codeTags) {
              const text = tag.textContent?.trim() || '';
              if (isValidFilePath(text)) {
                explicitPath = text;
                break;
              }
            }

            if (!explicitPath) {
              const match = sibling.textContent?.match(
                /(?:file|located at|create|in|path|filename)\s*(?:is|at|in|named)?\s*[`'"]?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)[`'"]?/i
              );
              if (match && match[1] && isValidFilePath(match[1])) {
                explicitPath = match[1];
              }
            }
          }

          sibling = sibling.previousElementSibling;
        }

        if (heading) break;

        // Ascend to parent element. If at top of ShadowRoot, bridge to shadow host in light DOM!
        if (current.parentElement) {
          current = current.parentElement;
        } else {
          try {
            const rootNode: Node | null = typeof current.getRootNode === 'function' ? current.getRootNode() : null;
            if (rootNode && rootNode !== document && (rootNode as ShadowRoot).host) {
              current = (rootNode as ShadowRoot).host;
            } else {
              current = null;
            }
          } catch {
            current = null;
          }
        }
        depth++;
      }
    } catch {
      // Return whatever was recovered safely
    }

    return { heading, explicitPath, langHint };
  }

  // Recursive shadow-penetrating DOM query
  function queryAllIncludingShadow(root: Document | Element | ShadowRoot, selectors: string[]): Element[] {
    const matched: Element[] = [];
    for (const sel of selectors) {
      try {
        const matches = root.querySelectorAll(sel);
        for (let i = 0; i < matches.length; i++) {
          matched.push(matches[i]);
        }
      } catch {
        // Continue
      }
    }

    try {
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.shadowRoot) {
          matched.push(...queryAllIncludingShadow(el.shadowRoot, selectors));
        }
      }
    } catch {
      // Ignore
    }

    return matched;
  }

  const containerSelectors = [
    'pre',
    'mdn-code-example',
    '.code-example pre',
    '.code-example',
    'pre[class*="brush"]',
    'div.gist-file',
    '.syntaxhighlighter',
    'pre.highlight',
    'div.highlight pre',
    'div[class*="highlight-"] pre',
    '.gatsby-highlight pre',
    '.theme-code-block',
    '[class*="codeBlockContainer"]',
    '.codebox',
    '.crayons-article__body pre',
    'figure[data-rehype-pretty-code-figure]',
    'code[class*="language-"]',
    'code[class*="lang-"]',
    'code[class*="brush"]',
    '.cm-content',
    '.CodeMirror-code',
    '.ace_content'
  ];

  const candidateElements: Element[] = [];
  const processedSet = new Set<Element>();

  const rawCandidates = queryAllIncludingShadow(document, containerSelectors);
  for (const elem of rawCandidates) {
    if (processedSet.has(elem)) continue;

    // Skip inline code tags inside text paragraphs/headings/table cells
    if (elem.tagName.toLowerCase() === 'code') {
      if (
        elem.closest('pre') ||
        elem.closest('p') ||
        elem.closest('li') ||
        elem.closest('span') ||
        elem.closest('h1, h2, h3, h4, h5, h6') ||
        elem.closest('td, th, a, em, strong')
      ) {
        continue;
      }
    }

    // Skip container elements if they contain a child pre (in light DOM or open shadowRoot)
    if (elem.tagName.toLowerCase() !== 'pre') {
      let hasChildPre = false;
      try {
        hasChildPre = Boolean(elem.querySelector('pre') || (elem.shadowRoot && elem.shadowRoot.querySelector('pre')));
      } catch {}
      if (hasChildPre) continue;
    }

    candidateElements.push(elem);
    processedSet.add(elem);
  }

  const cliPrefixes = ['npm ', 'npx ', 'pnpm ', 'yarn ', 'bun ', 'mvn ', 'gradle ', 'docker ', 'git ', 'pip ', 'cargo ', 'go ', 'curl '];
  const seenHashes = new Set<string>();
  const blocks: RawBlock[] = [];

  for (const elem of candidateElements) {
    try {
      const raw = extractCleanText(elem);
      const cleaned = cleanCode(raw);
      if (!cleaned || cleaned.length < 15) {
        const isCli = cliPrefixes.some((p) => cleaned.trim().startsWith(p));
        if (!isCli) continue;
      }

      const hash = cleaned.slice(0, 100) + '::' + cleaned.length;
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      const context = findContext(elem);

      blocks.push({
        rawCode: cleaned,
        heading: context.heading,
        explicitPath: context.explicitPath,
        languageHint: context.langHint
      });
    } catch {
      continue;
    }
  }

  return {
    pageTitle: document.title || 'Untitled Tutorial',
    pageUrl: window.location.href || '',
    blocks
  };
}

/**
 * Extracts all code blocks, commands, and configs from the active document.
 */
export function extractPageCode(): ExtractionResult {
  const pageRaw = runInPageExtraction();
  const snippets: ExtractedSnippet[] = [];

  pageRaw.blocks.forEach((block, index) => {
    const heading = block.explicitPath ? `File: ${block.explicitPath}` : block.heading;
    const classification = classifySnippet(block.rawCode, heading, index + 1);

    if (block.explicitPath) {
      classification.suggestedPath = block.explicitPath;
    }

    // Prioritize container language hint if available
    if (block.languageHint) {
      adjustClassificationWithHint(classification, block.languageHint, block.heading);
    }

    const lines = block.rawCode.split('\n');

    snippets.push({
      id: `snippet-${index + 1}-${Date.now()}`,
      rawCode: block.rawCode,
      category: classification.category,
      language: classification.language,
      suggestedPath: classification.suggestedPath,
      userPath: classification.suggestedPath,
      contextHeading: block.heading,
      lineCount: lines.length,
      charCount: block.rawCode.length,
      selected: true,
      isInlineCli: block.rawCode.length < 50 && classification.category === 'command'
    });
  });

  return {
    pageTitle: pageRaw.pageTitle,
    pageUrl: pageRaw.pageUrl,
    timestamp: Date.now(),
    snippets
  };
}

// Content script listener: handles requests from extension side panel or background script
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_PAGE_CODE') {
      try {
        const result = extractPageCode();
        sendResponse({ success: true, payload: result });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: errorMsg });
      }
      return true; // Keep message channel open for async response
    }
  });
}
