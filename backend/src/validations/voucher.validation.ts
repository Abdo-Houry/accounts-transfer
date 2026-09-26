import { z } from 'zod';
import { VoucherCategory, VoucherStatus, VoucherType } from '../types/enums';
import {
  dateRangeQuery,
  paginationQuery,
  positiveDecimal,
  searchQuery,
  uuid,
} from './common.validation';

const voucherBody = z.object({
  amount: positiveDecimal,
  currencyId: uuid,
  cashBoxId: uuid,
  customerId: uuid.nullable().optional(),
  correspondentId: uuid.nullable().optional(),
  counterpartyName: z.string().trim().max(150).nullable().optional(),
  category: z.nativeEnum(VoucherCategory).optional(),
  reason: z.string().trim().min(3, 'A reason is required').max(255),
  referenceType: z.string().trim().max(40).nullable().optional(),
  referenceId: uuid.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
});

export const createVoucherSchema = { body: voucherBody };

export const voidVoucherSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ reason: z.string().trim().min(3).max(255) }),
};

export const listVouchersSchema = {
  query: paginationQuery
    .merge(searchQuery)
    .merge(dateRangeQuery)
    .extend({
      type: z.nativeEnum(VoucherType).optional(),
      status: z.nativeEnum(VoucherStatus).optional(),
      category: z.nativeEnum(VoucherCategory).optional(),
      currencyId: uuid.optional(),
      cashBoxId: uuid.optional(),
      customerId: uuid.optional(),
      createdById: uuid.optional(),
    }),
};
