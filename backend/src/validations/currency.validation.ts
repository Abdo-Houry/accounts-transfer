import { z } from 'zod';
import { booleanish, currencyCode, dateRangeQuery, positiveDecimal, uuid } from './common.validation';

export const listCurrenciesSchema = {
  query: z.object({ includeInactive: booleanish.optional() }),
};

export const createCurrencySchema = {
  body: z.object({
    code: currencyCode,
    nameAr: z.string().trim().min(2).max(60),
    nameEn: z.string().trim().min(2).max(60),
    nameTr: z.string().trim().min(2).max(60),
    symbol: z.string().trim().max(8).optional(),
    decimalPlaces: z.coerce.number().int().min(0).max(6).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  }),
};

export const updateCurrencySchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    nameAr: z.string().trim().min(2).max(60).optional(),
    nameEn: z.string().trim().min(2).max(60).optional(),
    nameTr: z.string().trim().min(2).max(60).optional(),
    symbol: z.string().trim().max(8).optional(),
    decimalPlaces: z.coerce.number().int().min(0).max(6).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    isActive: booleanish.optional(),
  }),
};

const rateBody = z.object({
  currencyId: uuid,
  buyRate: positiveDecimal,
  sellRate: positiveDecimal,
  effectiveFrom: z.coerce.date().optional(),
  note: z.string().trim().max(255).optional(),
});

export const setRateSchema = { body: rateBody };

export const setRatesBulkSchema = {
  body: z.object({ rates: z.array(rateBody).min(1).max(50) }),
};

export const rateHistorySchema = {
  query: dateRangeQuery.extend({
    currencyId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
};
