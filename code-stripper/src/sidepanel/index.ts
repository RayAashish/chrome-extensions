import { buildProjectZip, triggerBlobDownload } from '../core/zipBuilder';
import { adjustClassificationWithHint, classifySnippet, slugify } from '../core/classifier';
import { ExtractedSnippet, ExtractionResult, PageRawExtraction, StorageState } from '../types';

// State
let currentResult: ExtractionResult | null = null;
let activeCategory: 'all' | 'source' | 'config-dep' | 'command' = 'all';
let searchQuery = '';
let isExtracting = false;

// DOM Elements
const domainText = document.getElementById('page-domain-text') as HTMLParagraphElement;
const snippetsContainer = document.getElementById('snippets-container') as HTMLElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const loadingState = document.getElementById('loading-state') as HTMLDivElement;
const btnRescan = document.getElementById('btn-rescan') as HTMLButtonElement;
const btnEmptyRescan = document.getElementById('btn-empty-rescan') as HTMLButtonElement;
const rescanIcon = document.getElementById('rescan-icon') as unknown as SVGElement;
const btnDownloadZip = document.getElementById('btn-download-zip') as HTMLButtonElement;
const zipCountBadge = document.getElementById('zip-count-badge') as HTMLSpanElement;
const btnCopyAllMd = document.getElementById('btn-copy-all-md') as HTMLButtonElement;
const copyAllText = document.getElementById('copy-all-text') as HTMLSpanElement;
const toggleSelectAll = document.getElementById('toggle-select-all') as HTMLInputElement;
const selectionSummary = document.getElementById('selection-summary') as HTMLSpanElement;
const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const filterClear = document.getElementById('filter-clear') as HTMLSpanElement;
const bmcToast = document.getElementById('bmc-toast') as HTMLElement;
const btnDismissBmc = document.getElementById('btn-dismiss-bmc') as HTMLButtonElement;

// Category tab buttons
const categoryTabs = document.querySelectorAll<HTMLButtonElement>('.category-tab');
const countAll = document.getElementById('count-all') as HTMLSpanElement;
const countSource = document.getElementById('count-source') as HTMLSpanElement;
const countConfig = document.getElementById('count-config') as HTMLSpanElement;
const countCommand = document.getElementById('count-command') as HTMLSpanElement;

/**
 * Universal in-page DOM scraper.
 * Self-contained without external imports so it can be injected safely by chrome.scripting.executeScript.
 */
function extractUniversalPageBlocks(): PageRawExtraction {
  const pageTitle = document.title || 'Untitled Tutorial';
  const pageUrl = window.location.href || '';

  // Helper: Strip line gutters (pipe, colon, spaced)
  function stripLineGutters(text: string): string {
    const lines = text.split('\n');
    if (lines.length < 2) return text;

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
    if (nonEmpty === 0) return text;

    if (pipeMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (pipePattern.test(l) ? l.replace(pipePattern, '$1') : l)).join('\n');
    }
    if (colonMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (colonPattern.test(l) ? l.replace(colonPattern, '$1') : l)).join('\n');
    }
    if (spacedMatches / nonEmpty >= 0.7) {
      return lines.map((l) => (spacedPattern.test(l) ? l.replace(spacedPattern, '$1') : l)).join('\n');
    }
    return text;
  }

  // Helper: Clean raw code
  function cleanCode(raw: string): string {
    let cleaned = raw.replace(/\r\n/g, '\n').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    cleaned = stripLineGutters(cleaned);

    // Strip accidental markdown code fence wrappers (```js ... ```)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
    }

    const lines = cleaned.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.join('\n');
  }

  // Helper: Clone element and strip UI buttons and gutters
  function extractCleanText(el: Element): string {
    // 1. Table with gutter and code (Baeldung syntaxhighlighter)
    const table = el.querySelector('table');
    if (table && el.querySelector('.gutter') && el.querySelector('.code')) {
      const codeCells = el.querySelectorAll('td.code, .syntaxhighlighter-code');
      if (codeCells.length > 0) {
        return Array.from(codeCells)
          .map((c) => c.textContent || '')
          .join('\n');
      }
    }

    // 2. GitHub Gist table (.blob-wrapper table)
    const gistTable = el.querySelector('.blob-wrapper table');
    if (gistTable) {
      const lines = el.querySelectorAll('.blob-code-inner, td.blob-code');
      if (lines.length > 0) {
        return Array.from(lines)
          .map((l) => l.textContent || '')
          .join('\n');
      }
    }

    // 3. Clone and remove copy buttons, icons, toolbars
    const clone = el.cloneNode(true) as HTMLElement;
    const selectorsToRemove = [
      '.line-numbers-rows',
      '.hljs-ln-numbers',
      '.gutter',
      '.blob-num',
      '.js-line-number',
      'button',
      '.copy-button',
      '.copy-code-button',
      '.clipboard-button',
      '.code-toolbar',
      '.toolbar',
      'svg',
      '[aria-label*="copy" i]',
      '[aria-label*="clipboard" i]',
      '.mac-header',
      '.code-header'
    ];
    for (const sel of selectorsToRemove) {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    }
    return clone.textContent || '';
  }

  // Helper: Check if a text is a valid file path hint
  function isValidFilePath(text: string): boolean {
    if (!text || text.length > 100 || text.startsWith('http') || text.includes('://')) return false;
    const fileExtPattern =
      /\.(?:java|kt|ts|tsx|js|jsx|yml|yaml|properties|xml|json|toml|py|go|rs|cs|cpp|c|h|sh|bash|sql|html|css|md|env|gradle)$/i;
    if (text.includes('/') || text.includes('\\')) {
      return /\.[a-zA-Z0-9]{1,5}$/.test(text) || text.endsWith('.env');
    }
    return fileExtPattern.test(text);
  }

  // Helper: Find context heading and explicit path hints
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
          // Stop backward search if hitting a prior code container
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
      // In case of unexpected DOM issues, return whatever was found
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

  // Universal candidate selectors for any technical tutorial on the web
  const candidateSelectors = [
    'pre',
    'mdn-code-example',
    '.code-example pre',
    '.code-example',
    'pre[class*="brush"]',
    '.syntaxhighlighter',
    'div.gist-file',
    '.code-block pre',
    '.code-block',
    '.highlight pre',
    'div.highlight',
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

  const rawCandidates = queryAllIncludingShadow(document, candidateSelectors);
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
  const blocks: Array<{ rawCode: string; heading: string; explicitPath: string | null; languageHint: string | null }> = [];

  for (const elem of candidateElements) {
    try {
      const raw = extractCleanText(elem);
      const cleaned = cleanCode(raw);
      if (!cleaned || cleaned.length < 15) {
        const isCli = cliPrefixes.some((p) => cleaned.trim().startsWith(p));
        if (!isCli) continue;
      }

      // Deduplicate identical code snippets
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
      // Never let one corrupted node abort page scanning
      continue;
    }
  }

  return {
    pageTitle,
    pageUrl,
    blocks
  };
}

/**
 * Maps languages to stylish Tailwind color badges.
 */
function getLanguageBadgeClass(lang: string): string {
  switch (lang.toLowerCase()) {
    case 'java':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'yaml':
    case 'yml':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'xml':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'bash':
    case 'sh':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'typescript':
    case 'ts':
    case 'tsx':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'javascript':
    case 'js':
    case 'jsx':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'json':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    case 'dockerfile':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'python':
    case 'py':
      return 'bg-teal-500/10 text-teal-300 border-teal-500/20';
    case 'rust':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    case 'go':
      return 'bg-cyan-600/10 text-cyan-300 border-cyan-500/20';
    default:
      return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  }
}

/**
 * Escapes HTML characters for safe rendering in code cards.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Checks and updates the Buy Me a Coffee trigger state.
 */
async function checkBmcTrigger(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

  const data = (await chrome.storage.local.get([
    'copyCount',
    'zipDownloaded',
    'bmcDismissed'
  ])) as Partial<StorageState>;

  const copyCount = data.copyCount || 0;
  const zipDownloaded = Boolean(data.zipDownloaded);
  const bmcDismissed = Boolean(data.bmcDismissed);

  if (!bmcDismissed && (copyCount >= 5 || zipDownloaded)) {
    bmcToast.classList.remove('hidden');
  } else {
    bmcToast.classList.add('hidden');
  }
}

/**
 * Increments the copy counter and triggers the BMC check.
 */
async function recordCopyAction(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const data = (await chrome.storage.local.get(['copyCount'])) as { copyCount?: number };
  const newCount = (data.copyCount || 0) + 1;
  await chrome.storage.local.set({ copyCount: newCount });
  await checkBmcTrigger();
}

/**
 * Records a successful ZIP skeleton download.
 */
async function recordZipAction(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ zipDownloaded: true });
  await checkBmcTrigger();
}

/**
 * Updates UI counter badges and select-all state.
 */
function updateCountsAndSelection(): void {
  if (!currentResult) {
    countAll.textContent = '0';
    countSource.textContent = '0';
    countConfig.textContent = '0';
    countCommand.textContent = '0';
    zipCountBadge.textContent = '0';
    return;
  }

  const all = currentResult.snippets;
  const source = all.filter((s) => s.category === 'source');
  const config = all.filter((s) => s.category === 'configuration' || s.category === 'dependency');
  const command = all.filter((s) => s.category === 'command');
  const selectedCount = all.filter((s) => s.selected).length;

  countAll.textContent = String(all.length);
  countSource.textContent = String(source.length);
  countConfig.textContent = String(config.length);
  countCommand.textContent = String(command.length);
  zipCountBadge.textContent = String(selectedCount);

  // Update selection toggle checkbox
  toggleSelectAll.checked = selectedCount > 0 && selectedCount === all.length;
  toggleSelectAll.indeterminate = selectedCount > 0 && selectedCount < all.length;
  selectionSummary.textContent = `${selectedCount} of ${all.length} included in .zip`;
}

/**
 * Renders all snippet cards according to current active filters.
 */
function renderSnippets(): void {
  if (!currentResult || currentResult.snippets.length === 0) {
    snippetsContainer.innerHTML = '';
    snippetsContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    updateCountsAndSelection();
    return;
  }

  emptyState.classList.add('hidden');
  snippetsContainer.classList.remove('hidden');

  // Filter snippets by category and search query
  const filtered = currentResult.snippets.filter((snippet) => {
    // Category match
    if (activeCategory === 'source' && snippet.category !== 'source') return false;
    if (
      activeCategory === 'config-dep' &&
      snippet.category !== 'configuration' &&
      snippet.category !== 'dependency'
    )
      return false;
    if (activeCategory === 'command' && snippet.category !== 'command') return false;

    // Search query match
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const pathMatch = (snippet.userPath || snippet.suggestedPath).toLowerCase().includes(q);
      const langMatch = snippet.language.toLowerCase().includes(q);
      const headingMatch = snippet.contextHeading.toLowerCase().includes(q);
      const codeMatch = snippet.rawCode.toLowerCase().includes(q);
      return pathMatch || langMatch || headingMatch || codeMatch;
    }

    return true;
  });

  if (filtered.length === 0) {
    snippetsContainer.innerHTML = `
      <div class="p-6 text-center text-zinc-500 text-xs">
        No snippets match the filter "${escapeHtml(searchQuery)}".
      </div>
    `;
    updateCountsAndSelection();
    return;
  }

  snippetsContainer.innerHTML = '';

  filtered.forEach((snippet) => {
    const card = document.createElement('article');
    card.className =
      'rounded-xl bg-zinc-900 border border-zinc-800/90 shadow-sm overflow-hidden transition-all duration-150 hover:border-zinc-700/80 animate-fade-in';
    card.dataset.id = snippet.id;

    const path = snippet.userPath || snippet.suggestedPath;
    const badgeClass = getLanguageBadgeClass(snippet.language);
    const isLong = snippet.lineCount > 12;

    card.innerHTML = `
      <!-- Card Header -->
      <div class="px-3 py-2 bg-zinc-900/90 border-b border-zinc-800/70 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- Selection Checkbox -->
          <input
            type="checkbox"
            ${snippet.selected ? 'checked' : ''}
            class="snippet-toggle-select w-3.5 h-3.5 rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            title="Include in ZIP skeleton"
          />

          <!-- Editable File Path -->
          <div class="flex items-center gap-1 min-w-0 group cursor-pointer path-edit-trigger" title="Click to edit file path">
            <span class="path-display font-mono text-xs font-semibold text-zinc-200 truncate group-hover:text-indigo-400 transition-colors">
              ${escapeHtml(path)}
            </span>
            <input
              type="text"
              value="${escapeHtml(path)}"
              class="path-input hidden w-full font-mono text-xs bg-zinc-800 border border-indigo-500 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none"
            />
            <svg class="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
        </div>

        <!-- Badges & Copy -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeClass}">
            ${escapeHtml(snippet.language)}
          </span>
          <span class="text-[10px] text-zinc-400 font-mono">
            ${snippet.lineCount}L
          </span>
          <!-- Copy Button -->
          <button class="btn-copy-snippet p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1 text-xs" title="Copy snippet">
            <svg class="copy-icon w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span class="copy-status hidden text-[10px] text-emerald-400 font-medium">Copied!</span>
          </button>
        </div>
      </div>

      <!-- Preceding Heading / Section Hint -->
      ${
        snippet.contextHeading
          ? `
        <div class="px-3 py-1 bg-zinc-950/40 border-b border-zinc-800/40 text-[10px] text-zinc-400 truncate flex items-center gap-1">
          <span class="text-zinc-500">Context:</span>
          <span class="truncate">${escapeHtml(snippet.contextHeading)}</span>
        </div>
      `
          : ''
      }

      <!-- Code Container -->
      <div class="relative group/code">
        <pre class="code-pre text-xs text-zinc-300 p-3 bg-zinc-950/80 overflow-x-auto select-text font-mono leading-relaxed ${
          isLong ? 'max-h-56' : ''
        } transition-all duration-200"><code>${escapeHtml(snippet.rawCode)}</code></pre>

        ${
          isLong
            ? `
          <button class="btn-expand-code w-full py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium border-t border-zinc-800 flex items-center justify-center gap-1 transition-colors">
            <span>Expand (${snippet.lineCount} lines)</span>
            <svg class="expand-icon w-3 h-3 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        `
            : ''
        }
      </div>
    `;

    // Event: Toggle selection
    const chk = card.querySelector('.snippet-toggle-select') as HTMLInputElement;
    chk.addEventListener('change', () => {
      snippet.selected = chk.checked;
      updateCountsAndSelection();
    });

    // Event: Inline file path editing
    const editTrigger = card.querySelector('.path-edit-trigger') as HTMLElement;
    const pathDisplay = card.querySelector('.path-display') as HTMLSpanElement;
    const pathInput = card.querySelector('.path-input') as HTMLInputElement;

    const commitPathEdit = () => {
      const newPath = pathInput.value.trim();
      if (newPath) {
        snippet.userPath = newPath;
        pathDisplay.textContent = newPath;
      } else {
        pathInput.value = snippet.userPath || snippet.suggestedPath;
      }
      pathInput.classList.add('hidden');
      pathDisplay.classList.remove('hidden');
    };

    editTrigger.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
      pathDisplay.classList.add('hidden');
      pathInput.classList.remove('hidden');
      pathInput.focus();
      pathInput.select();
    });

    pathInput.addEventListener('blur', commitPathEdit);
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitPathEdit();
      } else if (e.key === 'Escape') {
        pathInput.value = snippet.userPath || snippet.suggestedPath;
        pathInput.classList.add('hidden');
        pathDisplay.classList.remove('hidden');
      }
    });

    // Event: Copy Snippet
    const btnCopy = card.querySelector('.btn-copy-snippet') as HTMLButtonElement;
    const copyIcon = card.querySelector('.copy-icon') as unknown as SVGElement;
    const copyStatus = card.querySelector('.copy-status') as HTMLSpanElement;

    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(snippet.rawCode);
        copyIcon.classList.add('hidden');
        copyStatus.classList.remove('hidden');
        await recordCopyAction();
        setTimeout(() => {
          copyIcon.classList.remove('hidden');
          copyStatus.classList.add('hidden');
        }, 1800);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    });

    // Event: Expand/Collapse code container
    if (isLong) {
      const btnExpand = card.querySelector('.btn-expand-code') as HTMLButtonElement;
      const codePre = card.querySelector('.code-pre') as HTMLElement;
      const expandIcon = card.querySelector('.expand-icon') as unknown as SVGElement;
      const expandText = btnExpand.querySelector('span') as HTMLSpanElement;

      let expanded = false;
      btnExpand.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) {
          codePre.classList.remove('max-h-56');
          expandIcon.classList.add('rotate-180');
          expandText.textContent = 'Collapse';
        } else {
          codePre.classList.add('max-h-56');
          expandIcon.classList.remove('rotate-180');
          expandText.textContent = `Expand (${snippet.lineCount} lines)`;
        }
      });
    }

    snippetsContainer.appendChild(card);
  });

  updateCountsAndSelection();
}

/**
 * Validates whether a tab is an actionable web page tab.
 * Filters out internal browser pages and extension sidepanels across Chrome, Edge, and Brave.
 */
function isWebTab(tab: chrome.tabs.Tab | null | undefined): boolean {
  if (!tab?.id || !tab.url) return false;
  const u = tab.url.toLowerCase();
  if (
    u.startsWith('chrome-extension://') ||
    u.startsWith('edge-extension://') ||
    u.startsWith('ms-browser-extension://') ||
    u.startsWith('moz-extension://') ||
    u.startsWith('chrome://') ||
    u.startsWith('edge://') ||
    u.startsWith('brave://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools://') ||
    u.startsWith('view-source:')
  ) {
    return false;
  }
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://');
}

/**
 * Universal active tab finder.
 * Handles Chrome, Edge, and Brave sidepanel contexts by trying lastFocusedWindow,
 * currentWindow, and active tab queries while strictly filtering for real web pages.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;

  try {
    // 1. Try lastFocusedWindow (when side panel has separate window focus in Edge / Chrome)
    const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (isWebTab(focusedTab)) {
      return focusedTab;
    }

    // 2. Try currentWindow
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (isWebTab(currentTab)) {
      return currentTab;
    }

    // 3. Fallback: query all active tabs and pick the web page tab
    const allActive = await chrome.tabs.query({ active: true });
    const webTab = allActive.find((t) => isWebTab(t));
    if (webTab) return webTab;

    // 4. Fallback: query all tabs in browser
    const allTabs = await chrome.tabs.query({});
    const anyWeb = allTabs.find((t) => isWebTab(t));
    return anyWeb || currentTab || focusedTab || null;
  } catch (err) {
    console.warn('Error querying active tab:', err);
    return null;
  }
}

/**
 * Transforms raw page blocks into fully classified snippets using the core heuristic engine.
 */
function processRawPageData(raw: PageRawExtraction): ExtractionResult {
  const snippets: ExtractedSnippet[] = [];

  raw.blocks.forEach((block, index) => {
    const heading = block.explicitPath ? `File: ${block.explicitPath}` : block.heading;
    const classification = classifySnippet(block.rawCode, heading, index + 1);

    if (block.explicitPath) {
      classification.suggestedPath = block.explicitPath;
    }

    // If container provided an explicit language hint, honor and prioritize it
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
    pageTitle: raw.pageTitle || 'Untitled Tutorial',
    pageUrl: raw.pageUrl || '',
    timestamp: Date.now(),
    snippets
  };
}

/**
 * Triggers DOM extraction on the active browser tab.
 */
async function extractFromActiveTab(targetTab?: chrome.tabs.Tab): Promise<void> {
  if (isExtracting) return;
  isExtracting = true;

  rescanIcon.classList.add('animate-spin');
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  snippetsContainer.classList.add('hidden');

  try {
    const tab = targetTab || (await getActiveTab());

    if (!tab?.id) {
      domainText.textContent = 'No active tab detected';
      currentResult = null;
      renderSnippets();
      return;
    }

    // Set page domain preview if available
    if (tab.url) {
      try {
        const url = new URL(tab.url);
        domainText.textContent = url.hostname.replace(/^www\./, '');
        domainText.title = tab.title || tab.url;
      } catch {
        domainText.textContent = 'Active tab';
      }

      // Check if internal browser page
      if (!isWebTab(tab)) {
        domainText.textContent = 'Browser internal page';
        currentResult = null;
        renderSnippets();
        return;
      }
    } else {
      domainText.textContent = 'Active tab';
    }

    let extractionResult: ExtractionResult | null = null;

    // Strategy 1: Direct in-page script execution via chrome.scripting.executeScript
    // Injects extractUniversalPageBlocks directly into page isolated world
    if (chrome.scripting && chrome.scripting.executeScript) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractUniversalPageBlocks
        });

        if (results && results[0] && results[0].result) {
          const raw = results[0].result as PageRawExtraction;
          extractionResult = processRawPageData(raw);

          // Update domain text from inside page if tab.url was masked
          if (raw.pageUrl) {
            try {
              const u = new URL(raw.pageUrl);
              domainText.textContent = u.hostname.replace(/^www\./, '');
              domainText.title = raw.pageTitle || raw.pageUrl;
            } catch {
              // ignore url parsing error
            }
          }
        }
      } catch (scriptErr) {
        console.warn('Direct executeScript failed:', scriptErr);
      }
    }

    // Strategy 2: Content script message passing fallback
    if (!extractionResult) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CODE' });
        if (response?.success && response.payload) {
          extractionResult = response.payload;
        }
      } catch (msgErr) {
        console.warn('tabs.sendMessage fallback also failed:', msgErr);
      }
    }

    if (extractionResult) {
      currentResult = extractionResult;
    } else {
      currentResult = {
        pageTitle: tab.title || 'Untitled Page',
        pageUrl: tab.url || '',
        timestamp: Date.now(),
        snippets: []
      };
    }

    renderSnippets();
  } catch (err) {
    console.error('Extraction error:', err);
    currentResult = null;
    renderSnippets();
  } finally {
    isExtracting = false;
    rescanIcon.classList.remove('animate-spin');
    loadingState.classList.add('hidden');
  }
}

/**
 * Copies all extracted snippets as a formatted Markdown study note.
 */
async function copyAllAsMarkdown(): Promise<void> {
  if (!currentResult || currentResult.snippets.length === 0) return;

  const dateStr = new Date().toISOString().split('T')[0];
  let md = `# ${currentResult.pageTitle}\n\n`;
  md += `> Distilled with [CodeStripper](https://github.com/developer/codestripper) on ${dateStr}\n`;
  if (currentResult.pageUrl) {
    md += `> Source: ${currentResult.pageUrl}\n\n`;
  }
  md += `---\n\n`;

  const selected = currentResult.snippets.filter((s) => s.selected);
  const targets = selected.length > 0 ? selected : currentResult.snippets;

  for (let i = 0; i < targets.length; i++) {
    const s = targets[i];
    const path = s.userPath || s.suggestedPath;
    const heading = s.contextHeading || `Snippet ${i + 1}`;

    md += `### ${heading}\n\n`;
    md += `**File:** \`${path}\` | **Language:** \`${s.language}\`\n\n`;
    md += `\`\`\`${s.language}\n${s.rawCode}\n\`\`\`\n\n`;
  }

  await navigator.clipboard.writeText(md);

  // Visual feedback
  copyAllText.textContent = 'Copied .md!';
  btnCopyAllMd.classList.add('text-emerald-400', 'border-emerald-500/50');
  await recordCopyAction();

  setTimeout(() => {
    copyAllText.textContent = 'Copy as .md';
    btnCopyAllMd.classList.remove('text-emerald-400', 'border-emerald-500/50');
  }, 2000);
}

/**
 * Downloads selected snippets as a project skeleton .zip.
 */
async function downloadProjectZip(): Promise<void> {
  if (!currentResult || currentResult.snippets.length === 0) return;

  const selected = currentResult.snippets.filter((s) => s.selected);
  if (selected.length === 0) {
    alert('Please select at least one file to include in the ZIP download.');
    return;
  }

  const originalContent = btnDownloadZip.innerHTML;
  btnDownloadZip.innerHTML = `
    <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    <span>Packaging...</span>
  `;
  btnDownloadZip.disabled = true;

  try {
    const blob = await buildProjectZip(currentResult, selected);
    const slug = slugify(currentResult.pageTitle) || 'project';
    const filename = `${slug}-skeleton.zip`;

    triggerBlobDownload(blob, filename);
    await recordZipAction();
  } catch (err) {
    console.error('ZIP generation error:', err);
    alert('Failed to generate ZIP archive. Please check console for details.');
  } finally {
    btnDownloadZip.innerHTML = originalContent;
    btnDownloadZip.disabled = false;
  }
}

// Event Listeners
btnRescan.addEventListener('click', () => extractFromActiveTab());
btnEmptyRescan.addEventListener('click', () => extractFromActiveTab());
btnDownloadZip.addEventListener('click', downloadProjectZip);
btnCopyAllMd.addEventListener('click', copyAllAsMarkdown);

// Toggle Select All
toggleSelectAll.addEventListener('change', () => {
  if (!currentResult) return;
  const isChecked = toggleSelectAll.checked;
  currentResult.snippets.forEach((s) => (s.selected = isChecked));
  renderSnippets();
});

// Category Tab Filters
categoryTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    categoryTabs.forEach((t) => {
      t.classList.remove('bg-zinc-800', 'text-zinc-100');
      t.classList.add('bg-zinc-900/60', 'text-zinc-400');
    });
    tab.classList.remove('bg-zinc-900/60', 'text-zinc-400');
    tab.classList.add('bg-zinc-800', 'text-zinc-100');

    activeCategory = (tab.dataset.category || 'all') as typeof activeCategory;
    renderSnippets();
  });
});

// Search input
filterInput.addEventListener('input', () => {
  searchQuery = filterInput.value;
  if (searchQuery.length > 0) {
    filterClear.classList.remove('hidden');
  } else {
    filterClear.classList.add('hidden');
  }
  renderSnippets();
});

filterClear.addEventListener('click', () => {
  filterInput.value = '';
  searchQuery = '';
  filterClear.classList.add('hidden');
  renderSnippets();
});

// Dismiss Buy Me a Coffee banner
btnDismissBmc.addEventListener('click', async () => {
  bmcToast.classList.add('hidden');
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ bmcDismissed: true });
  }
});

// Auto-rescan when active tab changes or finishes loading
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (isWebTab(tab)) {
        await extractFromActiveTab(tab);
        return;
      }
    } catch {
      // Fallback to active tab search
    }
    await extractFromActiveTab();
  });

  chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isWebTab(tab)) {
      await extractFromActiveTab(tab);
    }
  });
}

// Initial boot
document.addEventListener('DOMContentLoaded', async () => {
  await checkBmcTrigger();
  await extractFromActiveTab();
});
