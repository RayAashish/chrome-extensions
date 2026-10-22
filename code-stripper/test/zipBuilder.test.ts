import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  buildAsciiTreeFromPaths,
  generateReadme,
  buildProjectZip
} from '../src/core/zipBuilder';
import { ExtractionResult } from '../src/types';

describe('Zip Builder Module', () => {
  it('builds an ASCII tree structure from paths', () => {
    const paths = [
      'pom.xml',
      'src/main/resources/application.yml',
      'src/main/java/com/example/App.java'
    ];
    const tree = buildAsciiTreeFromPaths(paths);
    expect(tree).toContain('pom.xml');
    expect(tree).toContain('src/');
    expect(tree).toContain('main/');
    expect(tree).toContain('java/');
    expect(tree).toContain('App.java');
  });

  it('generates a comprehensive README.md with CLI commands and file index', () => {
    const mockResult: ExtractionResult = {
      pageTitle: 'Spring Boot Kafka Guide',
      pageUrl: 'https://example.com/kafka',
      timestamp: Date.now(),
      snippets: [
        {
          id: '1',
          rawCode: 'docker run -d -p 9092:9092 kafka',
          category: 'command',
          language: 'bash',
          suggestedPath: 'scripts/commands.sh',
          userPath: 'scripts/commands.sh',
          contextHeading: 'Step 1: Start Kafka',
          lineCount: 1,
          charCount: 35,
          selected: true
        },
        {
          id: '2',
          rawCode: 'public class Producer {}',
          category: 'source',
          language: 'java',
          suggestedPath: 'src/main/java/Producer.java',
          userPath: 'src/main/java/Producer.java',
          contextHeading: 'Step 2: Create Producer',
          lineCount: 1,
          charCount: 24,
          selected: true
        }
      ]
    };

    const readme = generateReadme(mockResult.pageTitle, mockResult.pageUrl, mockResult.snippets);
    expect(readme).toContain('# Spring Boot Kafka Guide');
    expect(readme).toContain('https://example.com/kafka');
    expect(readme).toContain('docker run -d -p 9092:9092 kafka');
    expect(readme).toContain('`src/main/java/Producer.java`');
    expect(readme).toContain('README.md');
  });

  it('builds a valid in-memory zip containing files and auto-generated README.md', async () => {
    const mockResult: ExtractionResult = {
      pageTitle: 'Demo Project',
      pageUrl: 'https://example.com/demo',
      timestamp: Date.now(),
      snippets: [
        {
          id: '1',
          rawCode: '<project>...</project>',
          category: 'dependency',
          language: 'xml',
          suggestedPath: 'pom.xml',
          userPath: 'pom.xml',
          contextHeading: 'Dependencies',
          lineCount: 1,
          charCount: 22,
          selected: true
        },
        {
          id: '2',
          rawCode: 'server:\n  port: 8080',
          category: 'configuration',
          language: 'yaml',
          suggestedPath: 'src/main/resources/application.yml',
          userPath: 'src/main/resources/application.yml',
          contextHeading: 'Config',
          lineCount: 2,
          charCount: 21,
          selected: true
        },
        {
          id: '3',
          rawCode: '// bad example',
          category: 'source',
          language: 'java',
          suggestedPath: 'src/main/java/BadExample.java',
          userPath: 'src/main/java/BadExample.java',
          contextHeading: 'Do Not Do This',
          lineCount: 1,
          charCount: 14,
          selected: false // Unselected!
        }
      ]
    };

    const zipBlob = await buildProjectZip(mockResult);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(100);

    // Unpack with JSZip to verify file contents
    const unzipped = await JSZip.loadAsync(zipBlob);
    expect(unzipped.file('pom.xml')).not.toBeNull();
    expect(unzipped.file('src/main/resources/application.yml')).not.toBeNull();
    expect(unzipped.file('README.md')).not.toBeNull();
    // Verify unselected file was NOT added
    expect(unzipped.file('src/main/java/BadExample.java')).toBeNull();

    const pomContent = await unzipped.file('pom.xml')!.async('string');
    expect(pomContent).toBe('<project>...</project>');
  });
});
