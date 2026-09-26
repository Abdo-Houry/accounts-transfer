import { z } from 'zod';
import { Money } from '../utils/money';
import { ReportPeriod } from '../types/enums';

export const uuid = z.string().uuid({ message: 'Must be a valid identifier' });

/**
 * Money always crosses the wire as a *string*.
 *
 * A JSON number cannot hold 10 decimal places without rounding, so accepting
 * one here would silently corrupt an amount before it ever reached the ledger.
 * A number is tolerated only to be converted straight to its decimal text.
 */
export const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => Money.isValid(value), { message: 'Must be a valid decimal amount' })
  .transform((value) => Money.from(value).toString());

export const positiveDecimal = decimalString.refine(
  (value) => Money.from(value).isPositive(),
  { message: 'Must be greater than zero' },
);

export const nonNegativeDecimal = decimalString.refine(
  (value) => !Money.from(value).isNegative(),
  { message: 'Must be zero or greater' },
);

/**
 * Boolean from a query string or a JSON body.
 *
 * `z.coerce.boolean()` cannot be used: `Boolean("false")` is `true`, so
 * `?includeInactive=false` would switch the flag on. This accepts a real
 * boolean or the usual textual spellings and rejects anything else.
 */
export const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean'
      ? value
      : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

export const idParam = z.object({ id: uuid });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).optional(),
});

export const dateString = z.coerce.date();

export const dateRangeQuery = z.object({
  period: z.nativeEnum(ReportPeriod).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export const searchQuery = z.object({ q: z.string().trim().min(1).max(120).optional() });

export const phone = z
  .string()
  .trim()
  .min(5, 'Phone number is too short')
  .max(30)
  .regex(/^[+0-9()\-\s]+$/, 'Phone number contains invalid characters');

export const personName = z.string().trim().min(2, 'Name is too short').max(150);

export const currencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Must be a 3-letter currency code')
  .transform((value) => value.toUpperCase());

/**
 * Passwords are the one credential the office controls directly, so the bar is
 * a length that survives an offline attack rather than a decorative symbol rule.
 */
export const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');
