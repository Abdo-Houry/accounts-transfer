import ar from './messages/ar';
import en, { type MessageKey } from './messages/en';
import tr from './messages/tr';
import type { Language } from '@/types/enums';

export type { MessageKey };
export type TranslateParams = Record<string, string | number>;

export const CATALOGUES: Record<Language, Record<MessageKey, string>> = { ar, en, tr };

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string; dir: 'rtl' | 'ltr' }> = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr' },
];

export function directionOf(language: Language): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

export function isLanguage(value: unknown): value is Language {
  return value === 'ar' || value === 'en' || value === 'tr';
}

/**
 * Renders a key. Falls back to English and then to the key itself, so a missing
 * translation shows up in review rather than rendering as an empty label.
 */
export function translate(
  language: Language,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const template = CATALOGUES[language]?.[key] ?? CATALOGUES.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Translates a backend enum value (`PENDING`, `CASH`, `DEBIT`, …) without
 * forcing every call site to build the key by hand.
 */
export function translateEnum(language: Language, value: string | null | undefined): string {
  if (!value) return '-';
  const asStatus = `status.${value}` as MessageKey;
  if (CATALOGUES.en[asStatus]) return translate(language, asStatus);
  const asEnum = `enum.${value}` as MessageKey;
  if (CATALOGUES.en[asEnum]) return translate(language, asEnum);
  return value;
}

/** Development guard: lists keys a non-reference catalogue is missing. */
export function checkCatalogues(): Record<string, string[]> {
  const reference = Object.keys(en) as MessageKey[];
  const report: Record<string, string[]> = {};
  for (const language of ['ar', 'tr'] as const) {
    const missing = reference.filter((key) => !CATALOGUES[language][key]);
    if (missing.length > 0) report[language] = missing;
  }
  return report;
}
