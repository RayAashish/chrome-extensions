import JSZip from 'jszip';
import { ExtractedSnippet, ExtractionResult } from '../types';

/**
 * Builds an ASCII directory tree string from an array of relative file paths.
 */
export function buildAsciiTreeFromPaths(paths: string[]): string {
  interface TreeNode {
    [key: string]: TreeNode;
  }

  const root: TreeNode = {};

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    let current = root;
    for (const part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }

  function renderTree(node: TreeNode, prefix = ''): string[] {
    const keys = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir && !bIsDir) return 1;
      if (!aIsDir && bIsDir) return -1;
      return a.localeCompare(b);
    });

    const lines: string[] = [];
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const isDir = Object.keys(node[key]).length > 0;
      lines.push(`${prefix}${branch}${key}${isDir ? '/' : ''}`);
      if (isDir) {
        lines.push(...renderTree(node[key], prefix + (isLast ? '    ' : '│   ')));
      }
    });
    return lines;
  }

  return ['.', ...renderTree(root)].join('\n');
}

/**
 * Generates a comprehensive README.md summarizing the distilled tutorial,
 * including source links, execution commands, and project structure.
 */
export function generateReadme(
  pageTitle: string,
  pageUrl: string,
  snippets: ExtractedSnippet[]
): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const commands = snippets.filter((s) => s.category === 'command');
  const fileSnippets = snippets.filter((s) => s.category !== 'command' && s.category !== 'tree');
  const treeSnippets = snippets.filter((s) => s.category === 'tree');

  const filePaths = fileSnippets.map((s) => s.userPath || s.suggestedPath);
  filePaths.push('README.md');

  let readme = `# ${pageTitle.trim() || 'Distilled Tutorial Project'}\n\n`;
  readme += `> Auto-generated with [CodeStripper](https://github.com/developer/codestripper) on ${dateStr}.\n\n`;

  if (pageUrl) {
    readme += `**Original Tutorial:** [${pageUrl}](${pageUrl})\n\n`;
  }

  readme += `## Project Overview\n\n`;
  readme += `This project skeleton contains code snippets extracted directly from the technical tutorial, stripped of SEO prose and organized into standard directory conventions.\n\n`;

  // CLI Commands section
  if (commands.length > 0) {
    readme += `## Setup & CLI Commands\n\n`;
    readme += `Run the following commands in order to setup and verify the project:\n\n`;
    for (const cmd of commands) {
      if (cmd.contextHeading) {
        readme += `### ${cmd.contextHeading}\n\n`;
      }
      readme += `\`\`\`bash\n${cmd.rawCode}\n\`\`\`\n\n`;
    }
  }

  // Directory Tree
  readme += `## Project Structure\n\n`;
  if (treeSnippets.length > 0) {
    readme += `\`\`\`text\n${treeSnippets[0].rawCode}\n\`\`\`\n\n`;
  } else {
    readme += `\`\`\`text\n${buildAsciiTreeFromPaths(filePaths)}\n\`\`\`\n\n`;
  }

  // Files Table
  readme += `## Extracted Files\n\n`;
  readme += `| Path | Category | Language | Lines |\n`;
  readme += `| :--- | :--- | :--- | :--- |\n`;
  for (const s of fileSnippets) {
    const path = s.userPath || s.suggestedPath;
    readme += `| \`${path}\` | ${s.category} | ${s.language} | ${s.lineCount} |\n`;
  }
  readme += `| \`README.md\` | documentation | markdown | - |\n\n`;

  readme += `---\n*Generated 100% in-browser by CodeStripper.*`;

  return readme;
}

/**
 * Packages selected snippets into a client-side .zip archive in browser memory.
 */
export async function buildProjectZip(
  result: ExtractionResult,
  customSnippets?: ExtractedSnippet[]
): Promise<Blob> {
  const zip = new JSZip();
  const snippets = (customSnippets || result.snippets).filter((s) => s.selected);

  const seenPaths = new Map<string, number>();

  for (const snippet of snippets) {
    // Skip raw CLI commands and ASCII trees from creating separate root code files if preferred,
    // but save CLI commands into a helper scripts/setup.sh file!
    let path = (snippet.userPath || snippet.suggestedPath).trim().replace(/^[/\\]+/, '');

    if (!path) {
      path = `snippet-${Date.now()}.${snippet.language || 'txt'}`;
    }

    // Disambiguate duplicate paths
    if (seenPaths.has(path)) {
      const count = seenPaths.get(path)! + 1;
      seenPaths.set(path, count);
      const extIndex = path.lastIndexOf('.');
      if (extIndex !== -1) {
        path = `${path.substring(0, extIndex)}-${count}${path.substring(extIndex)}`;
      } else {
        path = `${path}-${count}`;
      }
    } else {
      seenPaths.set(path, 1);
    }

    zip.file(path, snippet.rawCode);
  }

  // Add auto-generated README.md
  const readmeContent = generateReadme(result.pageTitle, result.pageUrl, snippets);
  zip.file('README.md', readmeContent);

  // Generate ZIP blob with standard DEFLATE compression
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

/**
 * Triggers an immediate browser download for a given Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
