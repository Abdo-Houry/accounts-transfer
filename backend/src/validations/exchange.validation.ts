import { z } from 'zod';
import { ExchangeStatus, ExchangeType } from '../types/enums';
import {
  dateRangeQuery,
  nonNegativeDecimal,
  paginationQuery,
  positiveDecimal,
  searchQuery,
  uuid,
} from './common.validation';

const pricingFields = {
  fromCurrencyId: uuid,
  fromAmount: positiveDecimal,
  toCurrencyId: uuid,
  rate: positiveDecimal.nullable().optional(),
  commissionAmount: nonNegativeDecimal.nullable().optional(),
};

const differentCurrencies = <T extends { fromCurrencyId: string; toCurrencyId: string }>(data: T) =>
  data.fromCurrencyId !== data.toCurrencyId;

export const quoteExchangeSchema = {
  body: z.object(pricingFields).refine(differentCurrencies, {
    path: ['toCurrencyId'],
    message: 'The two currencies must be different',
  }),
};

export const createExchangeSchema = {
  body: z
    .object({
      ...pricingFields,
      cashBoxId: uuid,
      customerId: uuid.nullable().optional(),
      customerName: z.string().trim().max(150).nullable().optional(),
      customerPhone: z.string().trim().max(30).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine(differentCurrencies, {
      path: ['toCurrencyId'],
      message: 'The two currencies must be different',
    }),
};

export const reverseExchangeSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ reason: z.string().trim().min(3).max(255) }),
};

export const listExchangesSchema = {
  query: paginationQuery
    .merge(searchQuery)
    .merge(dateRangeQuery)
    .extend({
      type: z.nativeEnum(ExchangeType).optional(),
      status: z.nativeEnum(ExchangeStatus).optional(),
      currencyId: uuid.optional(),
      cashBoxId: uuid.optional(),
      customerId: uuid.optional(),
      createdById: uuid.optional(),
    }),
};
