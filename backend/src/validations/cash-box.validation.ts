import { z } from 'zod';
import { EntryDirection } from '../types/enums';
import { booleanish, dateRangeQuery, paginationQuery, positiveDecimal, uuid } from './common.validation';

export const createCashBoxSchema = {
  body: z.object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Code may contain letters, digits, underscore and dash')
      .transform((value) => value.toUpperCase()),
    nameAr: z.string().trim().min(2).max(100),
    nameEn: z.string().trim().min(2).max(100),
    nameTr: z.string().trim().min(2).max(100),
    branch: z.string().trim().max(100).optional(),
    description: z.string().trim().max(255).optional(),
    allowsNegative: booleanish.optional(),
  }),
};

export const updateCashBoxSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    nameAr: z.string().trim().min(2).max(100).optional(),
    nameEn: z.string().trim().min(2).max(100).optional(),
    nameTr: z.string().trim().min(2).max(100).optional(),
    branch: z.string().trim().max(100).optional(),
    description: z.string().trim().max(255).optional(),
    allowsNegative: booleanish.optional(),
  }),
};

export const openingBalanceSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    currencyId: uuid,
    amount: positiveDecimal,
    note: z.string().trim().max(255).optional(),
    occurredAt: z.coerce.date().optional(),
  }),
};

export const cashBoxTransferSchema = {
  body: z
    .object({
      fromCashBoxId: uuid,
      toCashBoxId: uuid,
      currencyId: uuid,
      amount: positiveDecimal,
      note: z.string().trim().max(255).optional(),
    })
    .refine((data) => data.fromCashBoxId !== data.toCashBoxId, {
      path: ['toCashBoxId'],
      message: 'Source and destination must differ',
    }),
};

export const statementSchema = {
  params: z.object({ id: uuid }),
  query: paginationQuery.merge(dateRangeQuery).extend({
    currencyId: uuid.optional(),
    direction: z.nativeEnum(EntryDirection).optional(),
  }),
};
