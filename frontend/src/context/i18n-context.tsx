import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  directionOf,
  isLanguage,
  translate,
  translateEnum,
  type MessageKey,
  type TranslateParams,
} from '@/i18n';
import { LANGUAGE_STORAGE_KEY } from '@/lib/constants';
import type { Language } from '@/types/enums';

interface I18nContextValue {
  language: Language;
  direction: 'rtl' | 'ltr';
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  /** Renders a backend enum value (`PENDING`, `DEBIT`, …) in the current language. */
  tEnum: (value: string | null | undefined) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Private browsing or blocked storage: fall through to the default.
  }
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  return isLanguage(browser) ? browser : 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);
  const direction = directionOf(language);

  /**
   * The document element carries both `lang` and `dir`: `dir` flips the whole
   * layout for Arabic, and `lang` is what the API client reads to set
   * `Accept-Language`, so server messages come back in the same language the
   * user is reading.
   */
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth breaking the switch.
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      direction,
      setLanguage,
      t: (key, params) => translate(language, key, params),
      tEnum: (enumValue) => translateEnum(language, enumValue),
    }),
    [language, direction, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useI18n().t;
}
