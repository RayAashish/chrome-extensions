import { ClassificationResult } from '../types';

/**
 * Deterministic rule-based classifier that infers the language, code category,
 * and standard project directory path for extracted snippets.
 */

// Regex patterns for explicit filename hints in headings or code comments
const FILENAME_HINT_REGEX =
  /(?:file(?:name|path)?|listing\s*\d*(?:\.\d+)*)?\s*[:\-\s]\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)/i;
const CODE_COMMENT_FILENAME_REGEX =
  /^(?:\/\/|#|\/\*|<!--)\s*(?:file(?:name)?:\s*)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)(?:\s*\*\/|-->)?/im;

// Common CLI command starters
const CLI_PREFIXES = [
  'mvn ',
  './mvnw',
  'gradle ',
  './gradlew',
  'npm ',
  'npx ',
  'pnpm ',
  'yarn ',
  'bun ',
  'docker ',
  'docker-compose ',
  'git ',
  'curl ',
  'wget ',
  'pip ',
  'pip3 ',
  'python ',
  'python3 ',
  'poetry ',
  'cargo ',
  'go run',
  'go get',
  'go build',
  'go mod',
  'kubectl ',
  'helm ',
  'brew ',
  'ng ',
  'dotnet ',
  'az ',
  'aws ',
  'gcloud '
];

/**
 * Normalizes raw language identifiers from syntax highlighters and HTML attributes.
 */
export function normalizeLanguage(rawLang: string): string {
  if (!rawLang) return 'text';
  const clean = rawLang.toLowerCase().trim().replace(/^(?:brush:\s*|language-|lang-|syntax-|highlight-)/, '');
  switch (clean) {
    case 'js':
    case 'javascript':
    case 'node':
    case 'nodejs':
      return 'javascript';
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'jsx':
      return 'javascript';
    case 'tsx':
      return 'typescript';
    case 'java':
      return 'java';
    case 'py':
    case 'python':
    case 'python3':
      return 'python';
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'shell':
      return 'bash';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'properties':
    case 'ini':
    case 'conf':
      return 'properties';
    case 'xml':
    case 'pom':
    case 'pom.xml':
      return 'xml';
    case 'json':
      return 'json';
    case 'sql':
    case 'mysql':
    case 'pgsql':
    case 'postgres':
    case 'postgresql':
      return 'sql';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'dockerfile':
    case 'docker':
      return 'dockerfile';
    case 'go':
    case 'golang':
      return 'go';
    case 'rs':
    case 'rust':
      return 'rust';
    case 'cs':
    case 'csharp':
    case 'c#':
      return 'csharp';
    case 'cpp':
    case 'c++':
    case 'c':
      return 'cpp';
    case 'kt':
    case 'kotlin':
      return 'kotlin';
    case 'groovy':
    case 'gradle':
      return 'groovy';
    case 'toml':
      return 'toml';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return clean;
  }
}

/**
 * Adjusts an existing classification when an explicit language hint from the DOM is available.
 */
export function adjustClassificationWithHint(
  result: ClassificationResult,
  hint: string,
  contextHeading: string = ''
): ClassificationResult {
  const norm = normalizeLanguage(hint);
  if (!norm || norm === 'text') return result;

  result.language = norm;

  // Determine category and default extension based on normalized language
  let targetExt = 'txt';
  switch (norm) {
    case 'bash':
      result.category = 'command';
      targetExt = 'sh';
      break;
    case 'yaml':
      result.category = 'configuration';
      targetExt = 'yml';
      break;
    case 'properties':
      result.category = 'configuration';
      targetExt = 'properties';
      break;
    case 'toml':
      result.category = result.suggestedPath.includes('Cargo') ? 'dependency' : 'configuration';
      targetExt = 'toml';
      break;
    case 'dockerfile':
      result.category = 'configuration';
      targetExt = 'Dockerfile';
      break;
    case 'xml':
      result.category = result.suggestedPath.includes('pom') ? 'dependency' : 'source';
      targetExt = 'xml';
      break;
    case 'json':
      result.category = result.suggestedPath.includes('package') ? 'dependency' : 'configuration';
      targetExt = 'json';
      break;
    case 'java':
      result.category = 'source';
      targetExt = 'java';
      break;
    case 'javascript':
      result.category = 'source';
      targetExt = 'js';
      break;
    case 'typescript':
      result.category = 'source';
      targetExt = 'ts';
      break;
    case 'python':
      result.category = 'source';
      targetExt = 'py';
      break;
    case 'go':
      result.category = 'source';
      targetExt = 'go';
      break;
    case 'rust':
      result.category = 'source';
      targetExt = 'rs';
      break;
    case 'csharp':
      result.category = 'source';
      targetExt = 'cs';
      break;
    case 'sql':
      result.category = 'source';
      targetExt = 'sql';
      break;
    case 'html':
      result.category = 'source';
      targetExt = 'html';
      break;
    case 'css':
      result.category = 'source';
      targetExt = 'css';
      break;
    default:
      targetExt = norm;
  }

  // If suggestedPath currently ends with an improper extension (like .xml for java code or .txt), fix it
  const currentPath = result.suggestedPath;
  const currentExtMatch = currentPath.match(/\.([a-zA-Z0-9]+)$/);
  const currentExt = currentExtMatch ? currentExtMatch[1].toLowerCase() : '';

  if (targetExt !== 'Dockerfile' && currentExt !== targetExt) {
    if (currentExt === 'xml' || currentExt === 'txt' || !currentExt) {
      if (norm === 'java' && !currentPath.startsWith('src/')) {
        const slug = contextHeading ? slugify(contextHeading) : 'Snippet';
        result.suggestedPath = `src/main/java/${slug}.java`;
      } else {
        result.suggestedPath = currentPath.replace(/\.[a-zA-Z0-9]+$/, `.${targetExt}`);
      }
    }
  }

  return result;
}

/**
 * Sanitizes and slugifies a heading string for clean fallback filenames.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Extracts explicit file path hints from section headings or code comments.
 */
export function extractFilenameHint(
  heading: string,
  rawCode: string
): string | null {
  // Check first line of code for filename comments (e.g. // src/main.ts or # config.yml)
  const firstLine = rawCode.trim().split('\n')[0] || '';
  const commentMatch = firstLine.match(CODE_COMMENT_FILENAME_REGEX);
  if (commentMatch && commentMatch[1]) {
    const candidate = commentMatch[1].trim();
    if (candidate.includes('.') && !candidate.startsWith('http')) {
      return candidate;
    }
  }

  // Check section heading (e.g. "Listing 1: KafkaProducerConfig.java" or "File: src/main/resources/application.yml")
  if (heading) {
    const headingMatch = heading.match(FILENAME_HINT_REGEX);
    if (headingMatch && headingMatch[1]) {
      const candidate = headingMatch[1].trim();
      if (candidate.includes('.') && !candidate.startsWith('http')) {
        return candidate;
      }
    }

    // Direct filename in heading like "pom.xml" or "application.yml"
    const words = heading.split(/\s+/);
    for (const word of words) {
      const cleanWord = word.replace(/[`"'(),:;]/g, '');
      if (
        /^[a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+$/.test(cleanWord) &&
        !cleanWord.startsWith('http')
      ) {
        return cleanWord;
      }
    }
  }

  return null;
}

/**
 * Checks if code snippet represents an ASCII directory tree diagram.
 */
function isAsciiTree(code: string): boolean {
  const treeGlyphs = ['├──', '└──', '│', '|--', '+--', '\\--'];
  const lines = code.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  let glyphMatches = 0;
  for (const line of lines) {
    if (treeGlyphs.some((glyph) => line.includes(glyph))) {
      glyphMatches++;
    }
  }
  return glyphMatches >= 2 && glyphMatches / lines.length >= 0.4;
}

/**
 * Checks if code snippet represents CLI / Terminal commands.
 */
function isCliCommand(code: string): boolean {
  const clean = code.trim();
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return false;

  // Check if lines start with shell prompt symbols '$' or '>'
  const promptLines = lines.filter((l) => l.startsWith('$') || l.startsWith('>'));
  if (promptLines.length > 0 && promptLines.length / lines.length >= 0.5) {
    return true;
  }

  // Check if first line matches any known CLI prefixes
  const firstNonComment = lines.find((l) => !l.startsWith('#')) || lines[0];
  const strippedLine = firstNonComment.replace(/^[$>]\s*/, '').trim();

  return CLI_PREFIXES.some((prefix) => strippedLine.startsWith(prefix));
}

/**
 * Classifies snippet category, language, and suggested file path.
 */
export function classifySnippet(
  rawCode: string,
  contextHeading: string = '',
  index: number = 1
): ClassificationResult {
  const code = rawCode.trim();
  const explicitHint = extractFilenameHint(contextHeading, code);

  // 1. ASCII Tree Check
  if (isAsciiTree(code)) {
    return {
      category: 'tree',
      language: 'text',
      suggestedPath: explicitHint || 'project-structure.txt'
    };
  }

  // 2. CLI Command Check
  if (isCliCommand(code)) {
    return {
      category: 'command',
      language: 'bash',
      suggestedPath: explicitHint || 'scripts/commands.sh'
    };
  }

  // 3. Maven POM
  if (
    code.includes('<project') ||
    (code.includes('<dependency>') && code.includes('</dependency>')) ||
    (code.includes('<dependencies>') && code.includes('</dependencies>')) ||
    (code.includes('<groupId>') && code.includes('<artifactId>'))
  ) {
    return {
      category: 'dependency',
      language: 'xml',
      suggestedPath: explicitHint || 'pom.xml'
    };
  }

  // 4. Gradle Build Files
  if (
    (code.includes('plugins {') ||
      code.includes('dependencies {') ||
      code.includes('repositories {') ||
      code.includes('id "') ||
      code.includes("id '") ||
      code.includes('implementation(') ||
      code.includes("implementation '")) &&
    !code.includes('package.json')
  ) {
    const isKotlinDsl =
      code.includes('plugins {') &&
      (code.includes('implementation(kotlin(') ||
        code.includes('val ') ||
        code.includes('.kts') ||
        code.includes('tasks.withType<'));
    return {
      category: 'dependency',
      language: isKotlinDsl ? 'kotlin' : 'groovy',
      suggestedPath: explicitHint || (isKotlinDsl ? 'build.gradle.kts' : 'build.gradle')
    };
  }

  // 5. Node.js package.json
  if (
    (code.includes('"dependencies"') ||
      code.includes('"devDependencies"') ||
      code.includes('"scripts"') ||
      code.includes('"peerDependencies"')) &&
    (code.startsWith('{') || code.includes('{'))
  ) {
    return {
      category: 'dependency',
      language: 'json',
      suggestedPath: explicitHint || 'package.json'
    };
  }

  // 6. tsconfig.json
  if (
    code.includes('"compilerOptions"') ||
    (code.includes('"extends"') && code.includes('"compilerOptions"'))
  ) {
    return {
      category: 'configuration',
      language: 'json',
      suggestedPath: explicitHint || 'tsconfig.json'
    };
  }

  // 7. Python requirements.txt or pyproject.toml
  if (
    code.includes('[tool.poetry]') ||
    code.includes('[project.dependencies]') ||
    code.includes('[build-system]')
  ) {
    return {
      category: 'dependency',
      language: 'toml',
      suggestedPath: explicitHint || 'pyproject.toml'
    };
  }

  if (
    /^(?:[a-zA-Z0-9_-]+(?:\[[a-zA-Z0-9_,-]+\])?\s*(?:==|>=|<=|~=|>|<)\s*[0-9a-zA-Z.*+_-]+(?:\s*;.*)?(?:\r?\n|$))+/m.test(
      code
    ) &&
    !code.includes(';') &&
    !code.includes('{') &&
    !code.includes('def ')
  ) {
    return {
      category: 'dependency',
      language: 'text',
      suggestedPath: explicitHint || 'requirements.txt'
    };
  }

  // 8. Rust Cargo.toml
  if (
    code.includes('[package]') &&
    (code.includes('name =') || code.includes('version =')) &&
    (code.includes('[dependencies]') || code.includes('edition ='))
  ) {
    return {
      category: 'dependency',
      language: 'toml',
      suggestedPath: explicitHint || 'Cargo.toml'
    };
  }

  // 9. Go go.mod
  if (/^module\s+[^\s]+/m.test(code) && /go\s+\d+\.\d+/m.test(code)) {
    return {
      category: 'dependency',
      language: 'go',
      suggestedPath: explicitHint || 'go.mod'
    };
  }

  // 10. Dockerfile
  if (
    /^(?:FROM|RUN|CMD|ENTRYPOINT|EXPOSE|WORKDIR|COPY|ADD|ENV|ARG)\s+/m.test(code) &&
    !code.includes(';') &&
    !code.includes('{')
  ) {
    return {
      category: 'configuration',
      language: 'dockerfile',
      suggestedPath: explicitHint || 'Dockerfile'
    };
  }

  // 11. Docker Compose
  if (
    (code.includes('services:') || code.includes('version:')) &&
    (code.includes('image:') || code.includes('build:') || code.includes('ports:')) &&
    (code.includes('volumes:') || code.includes('networks:') || code.includes('environment:'))
  ) {
    return {
      category: 'configuration',
      language: 'yaml',
      suggestedPath: explicitHint || 'docker-compose.yml'
    };
  }

  // 12. Kubernetes Manifests
  if (
    code.includes('apiVersion:') &&
    code.includes('kind:') &&
    (code.includes('metadata:') || code.includes('spec:'))
  ) {
    const kindMatch = code.match(/kind:\s*([A-Za-z0-9_-]+)/);
    const kindSlug = kindMatch ? kindMatch[1].toLowerCase() : 'manifest';
    return {
      category: 'configuration',
      language: 'yaml',
      suggestedPath: explicitHint || `k8s-${kindSlug}.yaml`
    };
  }

  // 13. Spring Boot YAML (application.yml)
  if (
    (code.includes('spring:') ||
      code.includes('server:') ||
      code.includes('logging:') ||
      code.includes('management:') ||
      code.includes('datasource:')) &&
    /^[ \t]*[a-zA-Z0-9_-]+:\s*(?:$|[^:]+$)/m.test(code) &&
    !code.includes(';') &&
    !code.includes('{')
  ) {
    return {
      category: 'configuration',
      language: 'yaml',
      suggestedPath: explicitHint || 'src/main/resources/application.yml'
    };
  }

  // 14. Spring Boot Properties (application.properties)
  if (
    /^(?:spring|server|logging|management|datasource)\.[a-zA-Z0-9._-]+\s*=/m.test(
      code
    )
  ) {
    return {
      category: 'configuration',
      language: 'properties',
      suggestedPath: explicitHint || 'src/main/resources/application.properties'
    };
  }

  // 15. .env Environment Files
  if (
    /^[A-Z0-9_]{3,}\s*=\s*['"]?[^\r\n]*['"]?$/m.test(code) &&
    !code.includes(';') &&
    !code.includes('{') &&
    !code.includes('class ')
  ) {
    return {
      category: 'configuration',
      language: 'properties',
      suggestedPath: explicitHint || '.env'
    };
  }

  // 16. JavaScript / TypeScript Detection (Classes, Functions, React, Node)
  const isJsClass = /class\s+([A-Za-z0-9_]+)[^{]*\{[\s\S]*?\bconstructor\s*\(/m.test(code);
  const isJsClassExpr = /const\s+([A-Za-z0-9_]+)\s*=\s*class\b/m.test(code);
  const hasJsx =
    /<[A-Z][a-zA-Z0-9]*[\s/>]/.test(code) ||
    /return\s*\(\s*<[a-zA-Z]/.test(code) ||
    code.includes('import React');
  const hasTsTypes =
    /interface\s+[A-Za-z0-9_]+/.test(code) ||
    /type\s+[A-Za-z0-9_]+\s*=/.test(code) ||
    /:\s*(?:string|number|boolean|any|void|React\.FC|Promise<)/.test(code);

  if (hasJsx && hasTsTypes) {
    const exportMatch = code.match(
      /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/
    );
    const compName = exportMatch ? exportMatch[1] : null;
    return {
      category: 'source',
      language: 'typescript',
      suggestedPath: explicitHint || (compName ? `src/components/${compName}.tsx` : 'src/App.tsx')
    };
  }

  if (hasTsTypes || code.includes('export interface ') || code.includes('export type ')) {
    const exportMatch = code.match(
      /export\s+(?:default\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/
    );
    const name = exportMatch ? exportMatch[1] : null;
    return {
      category: 'source',
      language: 'typescript',
      suggestedPath: explicitHint || (name ? `src/${name}.ts` : 'src/index.ts')
    };
  }

  if (hasJsx) {
    const exportMatch = code.match(
      /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/
    );
    const compName = exportMatch ? exportMatch[1] : null;
    return {
      category: 'source',
      language: 'javascript',
      suggestedPath: explicitHint || (compName ? `src/components/${compName}.jsx` : 'src/App.jsx')
    };
  }

  if (isJsClass || isJsClassExpr) {
    const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
    const exprMatch = code.match(/const\s+([A-Za-z0-9_]+)\s*=\s*class/);
    const className = classMatch ? classMatch[1] : (exprMatch ? exprMatch[1] : null);
    const jsName = className ? `${className}.js` : (contextHeading ? `${slugify(contextHeading)}.js` : `snippet-${index}.js`);
    return {
      category: 'source',
      language: 'javascript',
      suggestedPath: explicitHint || jsName
    };
  }

  // 17. Java Source Code Detection (Classes, Interfaces, and Code Fragments)
  const isDefinitelyNotJava =
    code.includes('constructor(') ||
    code.includes('console.log') ||
    code.includes('document.querySelector') ||
    code.includes('window.addEventListener') ||
    code.includes('def __init__') ||
    code.includes('using System;') ||
    code.includes('namespace ');

  const javaClassRegex =
    /(?:public\s+|protected\s+|private\s+)?(?:static\s+)?(?:final\s+|abstract\s+|sealed\s+)*(?:class|interface|record|enum|@interface)\s+([A-Za-z0-9_]+)/;
  const javaPackageRegex = /package\s+([a-zA-Z0-9_.]+)\s*;/;

  const javaClassMatch = !isDefinitelyNotJava && code.match(javaClassRegex);

  // Detect Java fragments / statements (e.g. Confluent Kafka, Spring controllers, JUnit tests)
  const isJavaFragment =
    !isDefinitelyNotJava &&
    (code.includes('public static void main') ||
      code.includes('System.out.println') ||
      code.includes('System.err.println') ||
      code.includes('import java.') ||
      code.includes('import javax.') ||
      code.includes('import jakarta.') ||
      code.includes('import org.springframework.') ||
      code.includes('import org.apache.kafka.') ||
      code.includes('import org.junit.') ||
      /(?:@Test|@SpringBootTest|@Override|@Autowired|@Component|@Service|@Repository|@Bean|@Configuration|@RestController|@GetMapping|@PostMapping|@Value|@Slf4j)\b/.test(
        code
      ) ||
      /(?:KafkaProducer|KafkaConsumer|Producer<|Consumer<|ProducerRecord|ConsumerRecord|Properties|ResponseEntity<|Optional<|List<|Map<|Set<|Stream<|ArrayList<|HashMap<)/.test(
        code
      ) ||
      (/[A-Z][a-zA-Z0-9_]*(?:<[a-zA-Z0-9_,\s<>]+>)?\s+[a-zA-Z0-9_]+\s*=\s*(?:new\s+[A-Z]|[a-zA-Z0-9_]+\()/m.test(
        code
      ) &&
        code.includes(';\n')));

  if (javaClassMatch || isJavaFragment) {
    const className = javaClassMatch ? javaClassMatch[1] : null;
    const pkgMatch = code.match(javaPackageRegex);
    const pkgPath = pkgMatch ? pkgMatch[1].replace(/\./g, '/') : '';

    const isTest =
      code.includes('@Test') ||
      code.includes('@SpringBootTest') ||
      (className && (className.endsWith('Test') || className.endsWith('Tests'))) ||
      pkgPath.includes('/test');

    const baseDir = isTest ? 'src/test/java' : 'src/main/java';
    const fallbackBaseName = contextHeading ? slugify(contextHeading) : `snippet-${index}`;
    const finalName = className ? `${className}.java` : `${fallbackBaseName}.java`;
    const fullPath = pkgPath ? `${baseDir}/${pkgPath}/${finalName}` : `${baseDir}/${finalName}`;

    return {
      category: 'source',
      language: 'java',
      suggestedPath: explicitHint || fullPath
    };
  }

  // 18. Rust Source Code
  if (
    code.includes('fn main()') ||
    ((code.includes('pub struct ') || code.includes('pub fn ') || code.includes('impl ')) &&
      (code.includes('let mut ') || code.includes('use std::') || code.includes('println!')))
  ) {
    const isMain = code.includes('fn main()');
    return {
      category: 'source',
      language: 'rust',
      suggestedPath: explicitHint || (isMain ? 'src/main.rs' : 'src/lib.rs')
    };
  }

  // 19. Go Source Code
  if (/^package\s+([a-zA-Z0-9_]+)/m.test(code) && /func\s+/m.test(code)) {
    const pkgMatch = code.match(/^package\s+([a-zA-Z0-9_]+)/m);
    const pkgName = pkgMatch ? pkgMatch[1] : 'main';
    const isMain = pkgName === 'main' || code.includes('func main()');

    return {
      category: 'source',
      language: 'go',
      suggestedPath: explicitHint || (isMain ? 'main.go' : `pkg/${pkgName}/${pkgName}.go`)
    };
  }

  // 20. Python Source Code
  if (
    (code.includes('def ') || code.includes('import ') || code.includes('from ')) &&
    (code.includes(':\n') || code.includes('if __name__ == "__main__":') || code.includes("if __name__ == '__main__':")) &&
    !code.includes(';') &&
    !code.includes('{')
  ) {
    const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
    const className = classMatch ? classMatch[1] : null;
    let pyName = 'main.py';
    if (className) {
      pyName = `${slugify(className)}.py`;
    } else if (contextHeading) {
      const slug = slugify(contextHeading);
      if (slug) pyName = `${slug}.py`;
    }
    return {
      category: 'source',
      language: 'python',
      suggestedPath: explicitHint || pyName
    };
  }

  // 21. C# Source Code
  if (
    code.includes('using System;') ||
    code.includes('namespace ') ||
    /public\s+class\s+([A-Za-z0-9_]+)/.test(code)
  ) {
    const csMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
    const name = csMatch ? `${csMatch[1]}.cs` : 'Program.cs';
    return {
      category: 'source',
      language: 'csharp',
      suggestedPath: explicitHint || name
    };
  }

  // 22. SQL Queries / DDL
  if (
    /^(?:CREATE\s+TABLE|ALTER\s+TABLE|SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)\s+/im.test(
      code
    )
  ) {
    const isSchema = /CREATE\s+TABLE/i.test(code);
    return {
      category: 'source',
      language: 'sql',
      suggestedPath: explicitHint || (isSchema ? 'schema.sql' : 'query.sql')
    };
  }

  // 23. HTML Document
  if (code.includes('<!DOCTYPE html>') || (code.includes('<html') && code.includes('</html>'))) {
    return {
      category: 'source',
      language: 'html',
      suggestedPath: explicitHint || 'index.html'
    };
  }

  // 24. CSS Styles
  if (
    /^[.#a-zA-Z0-9_\-\s,>+~:]+\s*\{\s*[\r\n]+(?:\s*[a-zA-Z-]+\s*:\s*[^;]+;\s*[\r\n]+)+\s*\}/m.test(
      code
    ) &&
    !code.includes('class ') &&
    !code.includes('def ')
  ) {
    return {
      category: 'source',
      language: 'css',
      suggestedPath: explicitHint || 'styles.css'
    };
  }

  // 25. Fallback Naming: Slugify nearest heading + inferred extension
  let fallbackExt = 'txt';
  let fallbackLang = 'text';

  // Guess extension based on robust syntax indicators
  if (
    (code.includes('{') && code.includes('}')) &&
    (code.includes('const ') ||
      code.includes('let ') ||
      code.includes('function') ||
      code.includes('console.log') ||
      code.includes('=>') ||
      code.includes('var '))
  ) {
    fallbackExt = 'js';
    fallbackLang = 'javascript';
  } else if (
    (code.startsWith('<?xml') || /<([a-zA-Z][a-zA-Z0-9_:-]*)(?:\s+[^>]*?)?>[\s\S]*?<\/\1>/m.test(code)) &&
    !code.includes(';\n') &&
    !code.includes('class ') &&
    !code.includes('function') &&
    !code.includes('return ')
  ) {
    fallbackExt = 'xml';
    fallbackLang = 'xml';
  } else if (code.includes(':') && !code.includes(';') && !code.includes('{') && !code.includes('def ')) {
    fallbackExt = 'yml';
    fallbackLang = 'yaml';
  }

  const headingSlug = contextHeading ? slugify(contextHeading) : '';
  const fallbackPath = headingSlug
    ? `${headingSlug}.${fallbackExt}`
    : `snippet-${index}.${fallbackExt}`;

  return {
    category: fallbackExt === 'yml' ? 'configuration' : 'source',
    language: fallbackLang,
    suggestedPath: explicitHint || fallbackPath
  };
}
