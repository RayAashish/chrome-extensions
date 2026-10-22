import { describe, expect, it } from 'vitest';
import {
  formatPaiseToIndianCurrency,
  paiseToPlainDecimal,
  paiseToRupees,
  parseIndianAmountToPaise
} from '../src/core/money';

describe('Indian Amount Parsing & Paise Arithmetic', () => {
  it('parses standard Indian grouped amounts into integer paise', () => {
    // 1,23,456.78 INR = 12345678 paise
    const res = parseIndianAmountToPaise('1,23,456.78');
    expect(res.paise).toBe(12345678);
    expect(res.isDebit).toBe(false);
    expect(res.isCredit).toBe(true);
  });

  it('strips Indian currency symbols (₹, Rs., INR)', () => {
    expect(parseIndianAmountToPaise('₹ 450.00').paise).toBe(45000);
    expect(parseIndianAmountToPaise('Rs. 1,500.50').paise).toBe(150050);
    expect(parseIndianAmountToPaise('INR 25,000').paise).toBe(2500000);
  });

  it('detects debit indicators (Dr, trailing minus, parentheses)', () => {
    const dr1 = parseIndianAmountToPaise('450.00 Dr');
    expect(dr1.paise).toBe(45000);
    expect(dr1.isDebit).toBe(true);

    const dr2 = parseIndianAmountToPaise('(1,250.00)');
    expect(dr2.paise).toBe(125000);
    expect(dr2.isDebit).toBe(true);

    const dr3 = parseIndianAmountToPaise('-500.00');
    expect(dr3.paise).toBe(50000);
    expect(dr3.isDebit).toBe(true);

    const dr4 = parseIndianAmountToPaise('750.50-');
    expect(dr4.paise).toBe(75050);
    expect(dr4.isDebit).toBe(true);
  });

  it('detects explicit Cr indicators', () => {
    const cr = parseIndianAmountToPaise('10,000.00 Cr');
    expect(cr.paise).toBe(1000000);
    expect(cr.isCredit).toBe(true);
    expect(cr.isDebit).toBe(false);
  });

  it('handles empty or dash inputs gracefully', () => {
    expect(parseIndianAmountToPaise('').paise).toBe(0);
    expect(parseIndianAmountToPaise('-').paise).toBe(0);
    expect(parseIndianAmountToPaise('--').paise).toBe(0);
    expect(parseIndianAmountToPaise(null).paise).toBe(0);
  });

  it('converts paise to plain decimal strings for CSV without floating point errors', () => {
    expect(paiseToPlainDecimal(12345678)).toBe('123456.78');
    expect(paiseToPlainDecimal(45000)).toBe('450.00');
    expect(paiseToPlainDecimal(5)).toBe('0.05');
    expect(paiseToPlainDecimal(-45000, true)).toBe('-450.00');
  });

  it('formats paise to Indian currency grouping (first 3, then pairs of 2)', () => {
    expect(formatPaiseToIndianCurrency(12345678)).toBe('1,23,456.78');
    expect(formatPaiseToIndianCurrency(10000000)).toBe('1,00,000.00');
    expect(formatPaiseToIndianCurrency(45000)).toBe('450.00');
    expect(formatPaiseToIndianCurrency(12345678, true)).toBe('₹ 1,23,456.78');
    expect(formatPaiseToIndianCurrency(-50000, true)).toBe('-₹ 500.00');
  });

  it('converts paise to rupees float accurately', () => {
    expect(paiseToRupees(45000)).toBe(450.0);
    expect(paiseToRupees(12345678)).toBe(123456.78);
  });
});
