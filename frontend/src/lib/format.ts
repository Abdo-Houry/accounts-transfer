import type { Currency, Decimal } from '@/types/api';
import type { Language } from '@/types/enums';

const LOCALES: Record<Language, string> = { ar: 'ar', en: 'en-GB', tr: 'tr-TR' };

/**
 * Dates and times render in English in every language.
 *
 * A remittance slip, a bank statement and an ID all carry a Gregorian date in
 * Latin script, so an operator reconciling a screen against paper should never
 * have to translate a month name or a meridiem marker in their head. The UI
 * language still drives everything else - only date/time rendering is pinned.
 */
const DATE_LOCALE = 'en-GB';

/**
 * Money formatting.
 *
 * Amounts arrive as exact decimal *strings*. They become a JavaScript number
 * only at this last step, for grouping and rounding on screen - never for
 * arithmetic, which always happens on the server.
 */
export function formatAmount(
  value: Decimal | number | null | undefined,
  decimals = 2,
  language: Language = 'en',
): string {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return new Intl.NumberFormat(LOCALES[language], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    // Latin digits in every language: an operator comparing a screen against a
    // paper slip should not have to read two numeral systems.
    numberingSystem: 'latn',
  }).format(numeric);
}

export function formatMoney(
  value: Decimal | null | undefined,
  currency: Pick<Currency, 'code' | 'decimalPlaces'> | undefined,
  language: Language = 'en',
): string {
  const formatted = formatAmount(value, currency?.decimalPlaces ?? 2, language);
  return currency ? formatted + ' ' + currency.code : formatted;
}

/** Rates need more precision than a balance; trailing zeros are trimmed. */
export function formatRate(value: Decimal | null | undefined, language: Language = 'en'): string {
  if (!value) return '-';
  const trimmed = String(value)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
  return formatAmount(trimmed, countDecimals(trimmed), language);
}

function countDecimals(value: string): number {
  const parts = value.split('.');
  return parts.length > 1 ? Math.min(parts[1].length, 6) : 0;
}

export function formatDate(value: string | Date | null | undefined, language: Language = 'en'): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  language: Language = 'en',
): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    numberingSystem: 'latn',
  }).format(date);
}

/** `2026-09-04` - the shape date inputs and query strings expect. */
export function toDateInput(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

/** Picks the right localised name off any `nameAr / nameEn / nameTr` record. */
export function localizedName(
  entity: { nameAr: string; nameEn: string; nameTr: string } | null | undefined,
  language: Language,
): string {
  if (!entity) return '-';
  if (language === 'ar') return entity.nameAr;
  if (language === 'tr') return entity.nameTr;
  return entity.nameEn;
}
