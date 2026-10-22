import { defaultPreferencesStore } from '../storage/preferences';
import { en } from './en';
import { hi } from './hi';
import { TranslationDictionary } from './types';

export class I18nManager {
  private static instance: I18nManager;
  private currentLang: 'en' | 'hi' = 'en';

  constructor() {
    const prefs = defaultPreferencesStore.getPreferences();
    this.currentLang = prefs.language || 'en';
  }

  public static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  public get t(): TranslationDictionary {
    return this.currentLang === 'hi' ? hi : en;
  }

  public getLanguage(): 'en' | 'hi' {
    return this.currentLang;
  }

  public setLanguage(lang: 'en' | 'hi'): void {
    this.currentLang = lang;
    const prefs = defaultPreferencesStore.getPreferences();
    prefs.language = lang;
    defaultPreferencesStore.save();
  }
}

export const i18n = I18nManager.getInstance();
