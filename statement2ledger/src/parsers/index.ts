/**
 * Statement2Ledger - Pluggable Bank Parser Registry
 */

import { GenericParser } from './generic';
import { HdfcParser } from './hdfc';
import { IciciParser } from './icici';
import { SbiParser } from './sbi';
import { DetectionResult, StatementParser } from './types';

export class ParserRegistry {
  private static instance: ParserRegistry;
  private parsers: StatementParser[] = [];
  private genericParser: StatementParser;

  constructor() {
    this.genericParser = new GenericParser();
    this.register(new HdfcParser());
    this.register(new SbiParser());
    this.register(new IciciParser());
    this.register(this.genericParser);
  }

  public static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  public register(parser: StatementParser): void {
    this.parsers.unshift(parser); // New parsers take priority
  }

  public getAll(): StatementParser[] {
    return this.parsers;
  }

  public findBestParser(
    sampleText: string,
    metadata?: { filename?: string; mimeType?: string }
  ): { parser: StatementParser; detection: DetectionResult } {
    let bestParser: StatementParser = this.genericParser;
    let bestDetection: DetectionResult = { confidence: 0, bankName: 'Generic Bank' };

    for (const parser of this.parsers) {
      if (parser.id === 'generic') continue;
      const res = parser.detect(sampleText, metadata);
      if (res.confidence > bestDetection.confidence) {
        bestDetection = res;
        bestParser = parser;
      }
    }

    if (bestDetection.confidence < 0.35) {
      return {
        parser: this.genericParser,
        detection: { confidence: 0.3, bankName: 'Generic Bank' }
      };
    }

    return { parser: bestParser, detection: bestDetection };
  }
}

export const defaultParserRegistry = ParserRegistry.getInstance();
