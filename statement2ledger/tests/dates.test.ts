import { describe, expect, it } from 'vitest';
import { isValidDate, normalizeYear, parseIndianDate } from '../src/core/dates';

describe('Indian Date Normalization', () => {
  it('parses standard DD/MM/YYYY day-first dates', () => {
    expect(parseIndianDate('15/10/2026')).toBe('2026-10-15');
    expect(parseIndianDate('01/01/2025')).toBe('2025-01-01');
    expect(parseIndianDate('31/12/2024')).toBe('2024-12-31');
  });

  it('parses DD-MM-YYYY with hyphens', () => {
    expect(parseIndianDate('15-10-2026')).toBe('2026-10-15');
    expect(parseIndianDate('05-04-2023')).toBe('2023-04-05');
  });

  it('parses DD.MM.YYYY with dots', () => {
    expect(parseIndianDate('15.10.2026')).toBe('2026-10-15');
    expect(parseIndianDate('28.02.2024')).toBe('2024-02-28');
  });

  it('parses 2-digit years correctly according to Indian banking convention (DD/MM/YY)', () => {
    // 26 -> 2026
    expect(parseIndianDate('15/10/26')).toBe('2026-10-15');
    expect(parseIndianDate('01/05/24')).toBe('2024-05-01');
    expect(parseIndianDate('15-10-26')).toBe('2026-10-15');
    // 99 -> 1999
    expect(parseIndianDate('15/10/99')).toBe('1999-10-15');
  });

  it('parses alphanumeric month dates (DD-MMM-YYYY, DD MMM YYYY)', () => {
    expect(parseIndianDate('15-OCT-2026')).toBe('2026-10-15');
    expect(parseIndianDate('15-Oct-2026')).toBe('2026-10-15');
    expect(parseIndianDate('15 Oct 2026')).toBe('2026-10-15');
    expect(parseIndianDate('01-JAN-2025')).toBe('2025-01-01');
    expect(parseIndianDate('15-Oct-26')).toBe('2026-10-15');
  });

  it('handles leap years correctly', () => {
    // 2024 is a leap year
    expect(isValidDate(2024, 2, 29)).toBe(true);
    expect(parseIndianDate('29/02/2024')).toBe('2024-02-29');

    // 2023 is not a leap year
    expect(isValidDate(2023, 2, 29)).toBe(false);
    expect(parseIndianDate('29/02/2023')).toBeNull();
  });

  it('rejects invalid or ambiguous dates', () => {
    expect(parseIndianDate('')).toBeNull();
    expect(parseIndianDate('invalid-date')).toBeNull();
    expect(parseIndianDate('32/01/2026')).toBeNull();
    expect(parseIndianDate('15/13/2026')).toBeNull();
  });

  it('normalizes 2-digit and 4-digit years properly', () => {
    expect(normalizeYear('26')).toBe('2026');
    expect(normalizeYear('05')).toBe('2005');
    expect(normalizeYear('85')).toBe('1985');
    expect(normalizeYear('2026')).toBe('2026');
  });
});
