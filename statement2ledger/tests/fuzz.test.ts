import { describe, expect, it } from 'vitest';
import { parseIndianDate } from '../src/core/dates';
import { parseIndianAmountToPaise } from '../src/core/money';
import { parseNarration } from '../src/core/narration';
import { HdfcParser } from '../src/parsers/hdfc';

describe('Property & Fuzz Testing - Robustness against Corrupted/Garbage Inputs', () => {
  it('never crashes on arbitrary garbage strings in money parser', () => {
    const garbageInputs = [
      '',
      '   ',
      '#$@!%^&*()',
      'null',
      'undefined',
      'NaN',
      '1..2..3..4',
      '-,---.--',
      '₹₹₹₹₹',
      'Dr Dr Dr',
      '--500--',
      '9999999999999999999999999999999999999999',
      '₹ 12,34,56,78,90,12,34.56',
      '\x00\x01\x02\xFF\xFE',
      '<script>alert(1)</script>'
    ];

    for (const input of garbageInputs) {
      expect(() => parseIndianAmountToPaise(input)).not.toThrow();
      const res = parseIndianAmountToPaise(input);
      expect(typeof res.paise).toBe('number');
      expect(res.paise).toBeGreaterThanOrEqual(0);
      expect(typeof res.isDebit).toBe('boolean');
      expect(typeof res.isCredit).toBe('boolean');
    }
  });

  it('never crashes on arbitrary garbage strings in date parser', () => {
    const garbageDates = [
      '',
      '   ',
      '99/99/9999',
      '00/00/0000',
      '31/02/2026',
      '29/02/2023',
      'invalid',
      '../../..',
      '\n\r\t',
      '2026-15-40',
      'OCT-15-2026-EXTRA'
    ];

    for (const d of garbageDates) {
      expect(() => parseIndianDate(d)).not.toThrow();
    }
  });

  it('never crashes on arbitrary garbage in narration tokenizer', () => {
    const garbageNarrations = [
      '',
      '---///@@@***',
      '000000000000000000000000000000000000000000',
      'UPI//--**//',
      'undefined null NaN',
      'A'.repeat(5000),
      '🎉💳💰🇮🇳',
      '\x00\x1b[31mRed\x1b[0m'
    ];

    for (const narr of garbageNarrations) {
      expect(() => parseNarration(narr)).not.toThrow();
      const res = parseNarration(narr);
      expect(res.mode).toBeDefined();
      expect(res.vendor).toBeDefined();
    }
  });

  it('preserves parsed result invariance when random whitespace is inserted', () => {
    const baseNarration = 'UPI-SWIGGY-BENGALURU-982347923-HDFC0001';
    const baseRes = parseNarration(baseNarration);

    // Insert varied spaces between tokens
    const variations = [
      'UPI - SWIGGY - BENGALURU - 982347923 - HDFC0001',
      'UPI  -  SWIGGY  -  BENGALURU  -  982347923  -  HDFC0001',
      'UPI-SWIGGY-BENGALURU-982347923-HDFC0001   ',
      '   UPI-SWIGGY-BENGALURU-982347923-HDFC0001'
    ];

    for (const v of variations) {
      const res = parseNarration(v);
      expect(res.vendor).toBe(baseRes.vendor);
      expect(res.mode).toBe(baseRes.mode);
      expect(res.reference).toBe(baseRes.reference);
    }
  });

  it('gracefully handles empty rows and malformed arrays in parsers', async () => {
    const parser = new HdfcParser();
    const emptyRows: string[][] = [[], ['   '], ['', '', '']];
    const meta = parser.extractMetadata('');

    await expect(
      parser.parse({ rows: emptyRows }, meta, { sourceFileName: 'empty.csv' })
    ).resolves.toBeDefined();
  });
});
