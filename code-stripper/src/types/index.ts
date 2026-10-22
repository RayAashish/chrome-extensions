/**
 * Core type definitions for CodeStripper Chrome Extension.
 */

export type CodeCategory =
  | 'dependency'     // pom.xml, build.gradle, package.json, requirements.txt, Cargo.toml, go.mod
  | 'configuration'  // application.yml, application.properties, .env, Dockerfile, docker-compose.yml
  | 'command'        // Terminal/CLI commands (mvn, npm, docker, git, curl)
  | 'source'         // .java, .ts, .py, .go, .rs, .cpp, .cs, etc.
  | 'tree';          // ASCII directory/file-tree diagrams

export interface ExtractedSnippet {
  id: string;
  rawCode: string;
  category: CodeCategory;
  language: string;
  suggestedPath: string;
  userPath: string;
  contextHeading: string;
  lineCount: number;
  charCount: number;
  selected: boolean;
  isInlineCli?: boolean;
}

export interface ExtractionResult {
  pageTitle: string;
  pageUrl: string;
  timestamp: number;
  snippets: ExtractedSnippet[];
}

export interface ClassificationResult {
  category: CodeCategory;
  language: string;
  suggestedPath: string;
}

export interface StorageState {
  copyCount: number;
  zipDownloaded: boolean;
  bmcDismissed: boolean;
}

export interface RawBlock {
  rawCode: string;
  heading: string;
  explicitPath: string | null;
  languageHint: string | null;
}

export interface PageRawExtraction {
  pageTitle: string;
  pageUrl: string;
  blocks: RawBlock[];
}

export type ExtensionMessage =
  | { type: 'EXTRACT_PAGE_CODE' }
  | { type: 'PAGE_CODE_EXTRACTED'; payload: ExtractionResult }
  | { type: 'EXTRACTION_ERROR'; error: string }
  | { type: 'OPEN_SIDEPANEL' };
