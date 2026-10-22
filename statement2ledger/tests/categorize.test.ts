import { describe, expect, it } from 'vitest';
import { defaultCategorizationEngine } from '../src/core/categorize';

describe('Categorization Engine & Rules', () => {
  it('categorizes known vendors into appropriate categories', () => {
    const swiggy = defaultCategorizationEngine.categorize('Swiggy', 'UPI-SWIGGY', 'UPI', true, 45000);
    expect(swiggy.category).toBe('Food & Dining');
    expect(swiggy.subcategory).toBe('Food Delivery');
    expect(swiggy.confidence).toBeGreaterThanOrEqual(0.9);

    const uber = defaultCategorizationEngine.categorize('Uber', 'UPI-UBER', 'UPI', true, 35000);
    expect(uber.category).toBe('Transport');
    expect(uber.subcategory).toBe('Cab & Auto');

    const zerodha = defaultCategorizationEngine.categorize('Zerodha', 'ACH-ZERODHA', 'ACH', true, 500000);
    expect(zerodha.category).toBe('Investments');
  });

  it('categorizes specialized modes (TDS, Interest, Charges, ATM, Salary)', () => {
    const tds = defaultCategorizationEngine.categorize('Income Tax Department', 'TDS ON INT', 'TDS', true, 34500);
    expect(tds.category).toBe('Taxes');
    expect(tds.subcategory).toBe('TDS');

    const interest = defaultCategorizationEngine.categorize('HDFC Bank', 'INT.PD SB', 'INTEREST', false, 345000);
    expect(interest.category).toBe('Interest');

    const charges = defaultCategorizationEngine.categorize('HDFC Bank', 'SMS CHG', 'CHARGES', true, 1770);
    expect(charges.category).toBe('Fees & Charges');

    const atm = defaultCategorizationEngine.categorize('ATM', 'ATM CASH WDL', 'ATM', true, 500000);
    expect(atm.category).toBe('Cash Withdrawal');

    const sal = defaultCategorizationEngine.categorize('Infosys', 'SALARY CREDIT OCT', 'SALARY', false, 18500000);
    expect(sal.category).toBe('Salary/Income');
  });

  it('tags freelance income and platforms as business', () => {
    const upwork = defaultCategorizationEngine.categorize('Upwork', 'NEFT CR-UPWORK', 'NEFT', false, 12000000);
    expect(upwork.category).toBe('Freelance Income');
    expect(upwork.isBusiness).toBe(true);
    expect(upwork.tags).toContain('Business');
  });

  it('flags large unknown credits (> ₹50k) for review', () => {
    const largeUnknown = defaultCategorizationEngine.categorize('Unknown Sender', 'IMPS INWARD', 'IMPS', false, 6000000);
    expect(largeUnknown.needsReview).toBe(true);
    expect(largeUnknown.reviewReasons.some((r) => r.includes('50,000'))).toBe(true);
  });

  it('respects user-defined rule overrides with maximum confidence', () => {
    defaultCategorizationEngine.addUserRule('SPECIAL VENDOR', 'Education', 'Coaching', false);
    const res = defaultCategorizationEngine.categorize('SPECIAL VENDOR', 'PAYMENT', 'UPI', true, 100000);
    expect(res.category).toBe('Education');
    expect(res.subcategory).toBe('Coaching');
    expect(res.confidence).toBe(0.99);
  });
});
