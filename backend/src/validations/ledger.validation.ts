import { z } from 'zod';
import { EntryDirection, TransactionType } from '../types/enums';
import { dateRangeQuery, paginationQuery, positiveDecimal, uuid } from './common.validation';

export const listTransactionsSchema = {
  query: paginationQuery.merge(dateRangeQuery).extend({
    type: z.nativeEnum(TransactionType).optional(),
    sourceType: z.string().trim().max(40).optional(),
    sourceId: uuid.optional(),
    createdById: uuid.optional(),
    referenceNo: z.string().trim().max(24).optional(),
  }),
};

export const listEntriesSchema = {
  query: paginationQuery.merge(dateRangeQuery).extend({
    accountId: uuid.optional(),
    cashBoxId: uuid.optional(),
    customerId: uuid.optional(),
    currencyId: uuid.optional(),
    direction: z.nativeEnum(EntryDirection).optional(),
  }),
};

export const balanceSheetSchema = {
  query: z.object({ asOf: z.coerce.date().optional() }),
};

export const incomeStatementSchema = { query: dateRangeQuery };

export const trialBalanceSchema = {
  query: z.object({
    asOf: z.coerce.date().optional(),
    currencyId: uuid.optional(),
  }),
};

/**
 * A manual journal entry. Requiring at least two lines and both a debit and a
 * credit catches the obvious mistakes here; `LedgerService.post` still checks
 * that the amounts balance per currency before anything is written.
 */
export const adjustmentSchema = {
  body: z.object({
    description: z.string().trim().min(3).max(255),
    occurredAt: z.coerce.date().optional(),
    lines: z
      .array(
        z.object({
          accountId: uuid.optional(),
          accountCode: z.string().trim().max(30).optional(),
          cashBoxId: uuid.nullable().optional(),
          customerId: uuid.nullable().optional(),
          currencyId: uuid,
          direction: z.nativeEnum(EntryDirection),
          amount: positiveDecimal,
          description: z.string().trim().max(255).optional(),
        }).refine((line) => Boolean(line.accountId || line.accountCode), {
          message: 'Each line needs an account',
        }),
      )
      .min(2, 'A journal entry needs at least two lines')
      .max(50),
  }).refine(
    (data) =>
      data.lines.some((line) => line.direction === EntryDirection.DEBIT) &&
      data.lines.some((line) => line.direction === EntryDirection.CREDIT),
    { path: ['lines'], message: 'A journal entry needs both a debit and a credit side' },
  ),
};
