/**
 * Statement2Ledger - Local Preferences Storage
 * 
 * STRICT PRIVACY ARCHITECTURE:
 * 1. Financial transactions, amounts, and account numbers are NEVER persisted.
 * 2. Only user-defined categorization rules, custom vendor aliases, and UI settings
 *    are stored locally in localStorage.
 * 3. Provides a one-click "Delete all local data" wipe function.
 */

import { defaultCategorizationEngine } from '../core/categorize';
import { defaultVendorRegistry } from '../core/vendors';
import { ManualColumnMapping, UserPreferences } from '../types';

const STORAGE_KEY = 'statement2ledger_user_prefs_v1';
const TIP_DISMISSED_KEY = 'statement2ledger_tip_dismissed_v1';

export class PreferencesStore {
  private static instance: PreferencesStore;
  private prefs: UserPreferences;

  constructor() {
    this.prefs = this.load();
    this.syncEngines();
  }

  public static getInstance(): PreferencesStore {
    if (!PreferencesStore.instance) {
      PreferencesStore.instance = new PreferencesStore();
    }
    return PreferencesStore.instance;
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      vendorRules: {},
      customVendors: {},
      savedMappings: {},
      maskSensitiveInfo: true,
      theme: 'dark',
      language: 'en'
    };
  }

  public load(): UserPreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getDefaultPreferences();
      const parsed = JSON.parse(raw);
      return {
        ...this.getDefaultPreferences(),
        ...parsed
      };
    } catch {
      return this.getDefaultPreferences();
    }
  }

  public save(): void {
    try {
      // Validate that no sensitive financial amounts or account numbers were accidentally added
      const sanitizedRules: Record<string, any> = {};
      for (const [vendor, rule] of Object.entries(this.prefs.vendorRules)) {
        // Only keep category, subcategory, and isBusiness
        sanitizedRules[vendor] = {
          category: String(rule.category),
          subcategory: rule.subcategory ? String(rule.subcategory) : undefined,
          isBusiness: Boolean(rule.isBusiness)
        };
      }
      this.prefs.vendorRules = sanitizedRules;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
      this.syncEngines();
    } catch (err) {
      console.warn('Failed to save preferences to localStorage:', err);
    }
  }

  private syncEngines(): void {
    // Sync to categorization engine
    defaultCategorizationEngine.setUserRules(this.prefs.vendorRules);

    // Sync custom vendors
    for (const [alias, norm] of Object.entries(this.prefs.customVendors)) {
      defaultVendorRegistry.addCustomVendor(alias, norm);
    }
  }

  public getPreferences(): UserPreferences {
    return { ...this.prefs };
  }

  public setVendorRule(vendor: string, category: string, subcategory = 'Other', isBusiness = false): void {
    const key = vendor.trim().toUpperCase();
    this.prefs.vendorRules[key] = { category, subcategory, isBusiness };
    this.save();
  }

  public addCustomVendorAlias(alias: string, normalizedName: string): void {
    this.prefs.customVendors[alias.trim().toUpperCase()] = normalizedName.trim();
    this.save();
  }

  public saveColumnMapping(bankName: string, mapping: ManualColumnMapping): void {
    this.prefs.savedMappings[bankName] = mapping;
    this.save();
  }

  public getColumnMapping(bankName: string): ManualColumnMapping | undefined {
    return this.prefs.savedMappings[bankName];
  }

  public setMaskSensitiveInfo(mask: boolean): void {
    this.prefs.maskSensitiveInfo = mask;
    this.save();
  }

  public setTheme(theme: 'dark' | 'light' | 'system'): void {
    this.prefs.theme = theme;
    this.save();
  }

  public isTipDismissed(): boolean {
    return localStorage.getItem(TIP_DISMISSED_KEY) === 'true';
  }

  public dismissTip(): void {
    localStorage.setItem(TIP_DISMISSED_KEY, 'true');
  }

  public deleteAllLocalData(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TIP_DISMISSED_KEY);
      this.prefs = this.getDefaultPreferences();
      this.syncEngines();
    } catch (err) {
      console.error('Failed to wipe local data:', err);
    }
  }
}

export const defaultPreferencesStore = PreferencesStore.getInstance();
