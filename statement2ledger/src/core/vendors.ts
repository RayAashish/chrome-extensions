/**
 * Statement2Ledger - Vendor Normalization Engine
 * Normalizes cryptic merchant strings and VPAs into clean human-readable names.
 * Uses bundled seed data from data/vendors.json plus user-defined aliases.
 */

import vendorSeedData from '../../data/vendors.json';
import { VendorEntry } from '../types';

export class VendorRegistry {
  private static instance: VendorRegistry;
  private vendors: VendorEntry[] = [];
  // Quick lookup maps:
  private aliasMap: Map<string, VendorEntry> = new Map();
  private vpaMap: Map<string, VendorEntry> = new Map();

  constructor() {
    this.loadVendors(vendorSeedData as VendorEntry[]);
  }

  public static getInstance(): VendorRegistry {
    if (!VendorRegistry.instance) {
      VendorRegistry.instance = new VendorRegistry();
    }
    return VendorRegistry.instance;
  }

  public loadVendors(entries: VendorEntry[]): void {
    this.vendors = entries;
    this.aliasMap.clear();
    this.vpaMap.clear();

    for (const v of entries) {
      // Index normalized name itself
      this.aliasMap.set(v.normalized.toUpperCase(), v);

      for (const alias of v.aliases) {
        const upper = alias.toUpperCase().trim();
        this.aliasMap.set(upper, v);
        if (alias.includes('@')) {
          this.vpaMap.set(alias.toLowerCase().trim(), v);
        }
      }
    }
  }

  /**
   * Adds or updates user-specific vendor alias mappings.
   */
  public addCustomVendor(rawAlias: string, normalizedName: string, category = 'Shopping', subcategory = 'Retail'): void {
    const upperAlias = rawAlias.toUpperCase().trim();
    const existing = this.aliasMap.get(upperAlias);
    if (existing) {
      existing.normalized = normalizedName;
      existing.category = category;
      existing.subcategory = subcategory;
    } else {
      const entry: VendorEntry = {
        normalized: normalizedName,
        category,
        subcategory,
        aliases: [rawAlias]
      };
      this.vendors.unshift(entry);
      this.aliasMap.set(upperAlias, entry);
      if (rawAlias.includes('@')) {
        this.vpaMap.set(rawAlias.toLowerCase().trim(), entry);
      }
    }
  }

  /**
   * Resolves a raw merchant string or token to a normalized vendor entry.
   */
  public matchVendor(candidate: string): VendorEntry | null {
    if (!candidate) return null;
    const trimmed = candidate.trim();
    const upper = trimmed.toUpperCase();
    const lower = trimmed.toLowerCase();

    // 1. Direct match on alias map
    if (this.aliasMap.has(upper)) {
      return this.aliasMap.get(upper)!;
    }

    // 2. Direct match on VPA if contains @
    if (candidate.includes('@')) {
      for (const [vpa, entry] of this.vpaMap.entries()) {
        if (lower === vpa || lower.includes(vpa)) {
          return entry;
        }
      }
    }

    // 3. Substring match across known aliases
    for (const entry of this.vendors) {
      for (const alias of entry.aliases) {
        const uAlias = alias.toUpperCase();
        // Word boundary match:
        const pattern = new RegExp(`(^|[^A-Z0-9])${escapeRegex(uAlias)}([^A-Z0-9]|$)`, 'i');
        if (pattern.test(upper)) {
          return entry;
        }
      }
    }

    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const defaultVendorRegistry = VendorRegistry.getInstance();
