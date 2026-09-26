import { z } from 'zod';
import {
  CommissionBearer,
  PaymentMethod,
  TransferDirection,
  TransferStatus,
} from '../types/enums';
import {
  booleanish,
  dateRangeQuery,
  nonNegativeDecimal,
  paginationQuery,
  personName,
  phone,
  positiveDecimal,
  searchQuery,
  uuid,
} from './common.validation';

/** Fields that determine the money, shared by `quote` and `create`. */
const pricingFields = {
  currencyId: uuid,
  amount: positiveDecimal,
  commissionAmount: nonNegativeDecimal.nullable().optional(),
  commissionBearer: z.nativeEnum(CommissionBearer).optional(),
  payoutCurrencyId: uuid.nullable().optional(),
  exchangeRate: positiveDecimal.nullable().optional(),
};

export const quoteTransferSchema = { body: z.object(pricingFields) };

export const createTransferSchema = {
  body: z.object({
    ...pricingFields,

    senderCustomerId: uuid.nullable().optional(),
    senderName: personName,
    senderPhone: phone,

    beneficiaryCustomerId: uuid.nullable().optional(),
    beneficiaryName: personName,
    beneficiaryPhone: phone,
    beneficiaryCountry: z.string().trim().min(2).max(80),
    beneficiaryCity: z.string().trim().min(1).max(80),

    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    // Exactly one funding channel; the service rejects a body with neither.
    cashBoxId: uuid.nullable().optional(),
    senderCorrespondentId: uuid.nullable().optional(),
    payoutCorrespondentId: uuid.nullable().optional(),
    direction: z.nativeEnum(TransferDirection).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Boolean(body.cashBoxId) || Boolean(body.senderCorrespondentId), {
    path: ['cashBoxId'],
    message: 'Either a cash box or a funding correspondent is required',
  }),
};

export const updateTransferSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    senderName: personName.optional(),
    senderPhone: phone.optional(),
    beneficiaryName: personName.optional(),
    beneficiaryPhone: phone.optional(),
    beneficiaryCountry: z.string().trim().min(2).max(80).optional(),
    beneficiaryCity: z.string().trim().min(1).max(80).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
};

export const sendTransferSchema = {
  params: z.object({ id: uuid }),
  body: z.object({ reason: z.string().trim().max(255).optional() }),
};

export const receiveTransferSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    payoutCashBoxId: uuid.nullable().optional(),
    payoutCorrespondentId: uuid.nullable().optional(),
    receivedByName: z.string().trim().max(150).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
};

export const cancelTransferSchema = {
  params: z.object({ id: uuid }),
  body: z.object({
    reason: z.string().trim().min(3, 'A cancellation reason is required').max(255),
    refundCommission: booleanish.optional(),
  }),
};

export const listTransfersSchema = {
  query: paginationQuery
    .merge(searchQuery)
    .merge(dateRangeQuery)
    .extend({
      status: z.nativeEnum(TransferStatus).optional(),
      direction: z.nativeEnum(TransferDirection).optional(),
      currencyId: uuid.optional(),
      cashBoxId: uuid.optional(),
      customerId: uuid.optional(),
      createdById: uuid.optional(),
    }),
};

export const lookupTransferSchema = {
  query: z
    .object({
      transferNo: z.string().trim().min(3).max(24).optional(),
      phone: z.string().trim().min(3).max(30).optional(),
      beneficiaryName: z.string().trim().min(2).max(150).optional(),
    })
    .refine((data) => data.transferNo || data.phone || data.beneficiaryName, {
      message: 'Provide a transfer number, a phone number or a beneficiary name',
    }),
};
