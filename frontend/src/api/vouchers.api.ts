import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type { Voucher } from '@/types/api';
import type { VoucherCategory, VoucherStatus, VoucherType } from '@/types/enums';

export interface VoucherPayload {
  amount: string;
  currencyId: string;
  cashBoxId: string;
  customerId?: string | null;
  /** Required when the category is CORRESPONDENT_SETTLEMENT. */
  correspondentId?: string | null;
  counterpartyName?: string | null;
  category?: VoucherCategory;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface VoucherListParams {
  page?: number;
  limit?: number;
  q?: string;
  type?: VoucherType;
  status?: VoucherStatus;
  category?: VoucherCategory;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

export const vouchersApi = {
  list: (params: VoucherListParams) =>
    requestPage<Voucher>({ url: '/vouchers', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<Voucher>({ url: `/vouchers/${id}`, method: 'GET' }),

  createReceipt: (payload: VoucherPayload) =>
    requestWithMessage<Voucher>({ url: '/vouchers/receipt', method: 'POST', data: payload }),

  createPayment: (payload: VoucherPayload) =>
    requestWithMessage<Voucher>({ url: '/vouchers/payment', method: 'POST', data: payload }),

  void: (id: string, reason: string) =>
    requestWithMessage<Voucher>({ url: `/vouchers/${id}/void`, method: 'POST', data: { reason } }),
};
