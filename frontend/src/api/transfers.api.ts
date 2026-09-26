import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type {
  Transfer,
  TransferQuote,
  TransferReceipt,
  TransferStatusHistory,
} from '@/types/api';
import type {
  CommissionBearer,
  PaymentMethod,
  TransferDirection,
  TransferStatus,
} from '@/types/enums';

export interface TransferQuotePayload {
  currencyId: string;
  amount: string;
  commissionAmount?: string | null;
  commissionBearer?: CommissionBearer;
  payoutCurrencyId?: string | null;
  exchangeRate?: string | null;
}

export interface CreateTransferPayload extends TransferQuotePayload {
  senderCustomerId?: string | null;
  senderName: string;
  senderPhone: string;
  beneficiaryCustomerId?: string | null;
  beneficiaryName: string;
  beneficiaryPhone: string;
  beneficiaryCountry: string;
  beneficiaryCity: string;
  paymentMethod?: PaymentMethod;
  /** Null when a partner office funded the deal instead of this office's counter. */
  cashBoxId?: string | null;
  /** The partner office that collected the money abroad. */
  senderCorrespondentId?: string | null;
  /** The partner office that will hand it over abroad. */
  payoutCorrespondentId?: string | null;
  direction?: TransferDirection;
  notes?: string | null;
}

export interface TransferListParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: TransferStatus;
  direction?: TransferDirection;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  createdById?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export const transfersApi = {
  list: (params: TransferListParams) =>
    requestPage<Transfer>({ url: '/transfers', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<Transfer>({ url: `/transfers/${id}`, method: 'GET' }),

  history: (id: string) =>
    request<TransferStatusHistory[]>({ url: `/transfers/${id}/history`, method: 'GET' }),

  receipt: (id: string) =>
    request<TransferReceipt>({ url: `/transfers/${id}/receipt`, method: 'GET' }),

  /** Payout desk search - only returns transfers that can still be collected. */
  lookup: (params: { transferNo?: string; phone?: string; beneficiaryName?: string }) =>
    request<Transfer[]>({ url: '/transfers/lookup', method: 'GET', params: cleanParams(params) }),

  /** Dry run; nothing is written. */
  quote: (payload: TransferQuotePayload) =>
    request<TransferQuote>({ url: '/transfers/quote', method: 'POST', data: payload }),

  create: (payload: CreateTransferPayload) =>
    requestWithMessage<Transfer>({ url: '/transfers', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CreateTransferPayload>) =>
    requestWithMessage<Transfer>({ url: `/transfers/${id}`, method: 'PATCH', data: payload }),

  send: (id: string, reason?: string) =>
    requestWithMessage<Transfer>({
      url: `/transfers/${id}/send`,
      method: 'POST',
      data: { reason },
    }),

  receive: (
    id: string,
    payload: {
      payoutCashBoxId?: string | null;
      /** Route the payout through a partner office instead of a cash box. */
      payoutCorrespondentId?: string | null;
      receivedByName?: string | null;
      notes?: string | null;
    },
  ) =>
    requestWithMessage<Transfer>({
      url: `/transfers/${id}/receive`,
      method: 'POST',
      data: payload,
    }),

  cancel: (id: string, payload: { reason: string; refundCommission?: boolean }) =>
    requestWithMessage<Transfer>({
      url: `/transfers/${id}/cancel`,
      method: 'POST',
      data: payload,
    }),
};
