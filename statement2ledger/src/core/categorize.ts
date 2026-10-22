/**
 * Statement2Ledger - Categorization Engine
 * Maps transactions to categories, subcategories, and tax/business tags.
 * Supports:
 * - Vendor dictionary mapping
 * - Mode mapping (ATM, TDS, Interest, Salary, Charges)
 * - Keyword/Regex matching
 * - User-defined overrides (persisted locally)
 * - Confidence scoring and "Needs Review" flagging
 */

import categorySeedData from '../../data/categories.json';
import { CategoryDefinition, PaymentMode, Transaction } from '../types';
import { defaultVendorRegistry } from './vendors';

export interface CategorizationResult {
  category: string;
  subcategory: string;
  tags: string[];
  confidence: number;
  needsReview: boolean;
  reviewReasons: string[];
  isBusiness: boolean;
}

export class CategorizationEngine {
  private static instance: CategorizationEngine;
  private categories: CategoryDefinition[] = [];
  private userVendorRules: Map<string, { category: string; subcategory?: string; isBusiness?: boolean }> = new Map();

  constructor() {
    this.categories = categorySeedData as CategoryDefinition[];
  }

  public static getInstance(): CategorizationEngine {
    if (!CategorizationEngine.instance) {
      CategorizationEngine.instance = new CategorizationEngine();
    }
    return CategorizationEngine.instance;
  }

  public setUserRules(rules: Record<string, { category: string; subcategory?: string; isBusiness?: boolean }>): void {
    this.userVendorRules.clear();
    for (const [vendor, rule] of Object.entries(rules)) {
      this.userVendorRules.set(vendor.toUpperCase(), rule);
    }
  }

  public addUserRule(vendor: string, category: string, subcategory = 'Other', isBusiness = false): void {
    this.userVendorRules.set(vendor.toUpperCase(), { category, subcategory, isBusiness });
  }

  public getAllCategories(): CategoryDefinition[] {
    return this.categories;
  }

  /**
   * Categorizes a transaction using multi-layered heuristic rules.
   */
  public categorize(
    vendor: string,
    rawNarration: string,
    mode: PaymentMode,
    isDebit: boolean,
    amountPaise: number
  ): CategorizationResult {
    const upperVendor = (vendor || '').toUpperCase().trim();
    const upperNarration = (rawNarration || '').toUpperCase().trim();
    const tags: string[] = [];
    const reviewReasons: string[] = [];

    // Tag basic mode
    tags.push(mode);

    // 1. User Defined Custom Overrides (Highest Priority: 0.99 Confidence)
    if (upperVendor && this.userVendorRules.has(upperVendor)) {
      const userRule = this.userVendorRules.get(upperVendor)!;
      return {
        category: userRule.category,
        subcategory: userRule.subcategory || 'Other',
        tags: [...tags, 'CustomRule'],
        confidence: 0.99,
        needsReview: false,
        reviewReasons: [],
        isBusiness: !!userRule.isBusiness
      };
    }

    // 2. Specialized Bank Modes (High Confidence: 0.95)
    if (mode === 'INTEREST') {
      return {
        category: 'Interest',
        subcategory: 'Savings Bank Interest',
        tags: [...tags, 'Income', 'Taxable'],
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    if (mode === 'TDS') {
      return {
        category: 'Taxes',
        subcategory: 'TDS',
        tags: [...tags, 'TDS', 'TaxSeason'],
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    if (mode === 'CHARGES') {
      return {
        category: 'Fees & Charges',
        subcategory: 'Bank Charges',
        tags: [...tags, 'BankFee'],
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    if (mode === 'ATM') {
      return {
        category: 'Cash Withdrawal',
        subcategory: 'ATM Withdrawal',
        tags: [...tags, 'Cash'],
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    if (mode === 'SALARY') {
      return {
        category: 'Salary/Income',
        subcategory: 'Monthly Salary',
        tags: [...tags, 'Income', 'Salary'],
        confidence: 0.95,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    // 3. Known Vendor Database Match (Confidence: 0.92)
    const vendorMatch = defaultVendorRegistry.matchVendor(vendor || rawNarration);
    if (vendorMatch) {
      // Check freelance income vs software expense
      const isFreelanceVendor =
        vendorMatch.normalized === 'Upwork' ||
        vendorMatch.normalized === 'Fiverr' ||
        vendorMatch.normalized === 'Deel' ||
        vendorMatch.normalized === 'Toptal';

      const category = (!isDebit && isFreelanceVendor) ? 'Freelance Income' : vendorMatch.category;
      const subcategory = (!isDebit && isFreelanceVendor) ? 'Client Payout' : vendorMatch.subcategory;
      const isBusiness = isFreelanceVendor || category === 'Freelance Income';

      if (isBusiness) {
        tags.push('Business');
      }

      // Check large transaction review (> 1,00,000 INR = 10,000,000 paise)
      const needsReview = amountPaise > 10000000;
      if (needsReview) {
        reviewReasons.push('Large transaction exceeding ₹1,00,000');
      }

      return {
        category,
        subcategory,
        tags: [...tags, vendorMatch.normalized],
        confidence: 0.92,
        needsReview,
        reviewReasons,
        isBusiness
      };
    }

    // 4. Keyword & Regex Heuristics across Categories (Confidence: 0.80)
    for (const catDef of this.categories) {
      if (catDef.isExpense !== null && catDef.isExpense !== isDebit) {
        continue;
      }
      for (const kw of catDef.keywords) {
        const pattern = new RegExp(`(^|[^A-Z0-9])${kw}([^A-Z0-9]|$)`, 'i');
        if (pattern.test(upperNarration) || pattern.test(upperVendor)) {
          const isBusiness = catDef.id === 'freelance-income' || upperNarration.includes('INVOICE') || upperNarration.includes('CONSULTING');
          if (isBusiness) tags.push('Business');

          const isLargeCredit = !isDebit && amountPaise >= 5000000;
          if (isLargeCredit) {
            reviewReasons.push('Unidentified large credit exceeding ₹50,000');
            tags.push('LargeCredit');
          }

          return {
            category: catDef.name,
            subcategory: catDef.subcategories[0] || 'General',
            tags,
            confidence: isLargeCredit ? 0.65 : 0.80,
            needsReview: isLargeCredit,
            reviewReasons,
            isBusiness
          };
        }
      }
    }

    // 5. Transfer / General Fallbacks
    if (mode === 'ACH') {
      return {
        category: 'EMI & Loans',
        subcategory: 'NACH / ECS Debit',
        tags: [...tags, 'Mandate'],
        confidence: 0.75,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    if (!isDebit && amountPaise >= 5000000) { // Large credit >= 50,000 INR
      reviewReasons.push('Unidentified large credit exceeding ₹50,000');
      return {
        category: 'Transfers',
        subcategory: 'Inward Credit',
        tags: [...tags, 'LargeCredit'],
        confidence: 0.60,
        needsReview: true,
        reviewReasons,
        isBusiness: false
      };
    }

    if (mode === 'UPI' || mode === 'NEFT' || mode === 'IMPS' || mode === 'RTGS') {
      return {
        category: 'Transfers',
        subcategory: isDebit ? 'Outward Transfer' : 'Inward Transfer',
        tags,
        confidence: 0.65,
        needsReview: false,
        reviewReasons: [],
        isBusiness: false
      };
    }

    // 6. Uncategorized (Needs Review)
    reviewReasons.push('Unrecognized merchant narration');
    return {
      category: 'Uncategorized',
      subcategory: 'Other',
      tags,
      confidence: 0.35,
      needsReview: true,
      reviewReasons,
      isBusiness: false
    };
  }
}

export const defaultCategorizationEngine = CategorizationEngine.getInstance();
