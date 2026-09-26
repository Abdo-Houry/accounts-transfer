import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type {
  CashBox,
  CashBoxBalance,
  LedgerEntry,
  ReconciliationResult,
} from '@/types/api';

export interface CashBoxPayload {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  branch?: string;
  description?: string;
  allowsNegative?: boolean;
}

export interface StatementParams {
  page?: number;
  limit?: number;
  currencyId?: string;
  from?: string;
  to?: string;
  direction?: 'DEBIT' | 'CREDIT';
}

export const cashBoxesApi = {
  list: (includeClosed = false) =>
    request<CashBox[]>({ url: '/cash-boxes', method: 'GET', params: { includeClosed } }),

  detail: (id: string) => request<CashBox>({ url: `/cash-boxes/${id}`, method: 'GET' }),

  balances: (id: string) =>
    request<CashBoxBalance[]>({ url: `/cash-boxes/${id}/balances`, method: 'GET' }),

  statement: (id: string, params: StatementParams) =>
    requestPage<LedgerEntry>({
      url: `/cash-boxes/${id}/statement`,
      method: 'GET',
      params: cleanParams(params),
    }),

  reconcile: (id: string) =>
    requestWithMessage<ReconciliationResult>({
      url: `/cash-boxes/${id}/reconciliation`,
      method: 'GET',
    }),

  create: (payload: CashBoxPayload) =>
    requestWithMessage<CashBox>({ url: '/cash-boxes', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CashBoxPayload>) =>
    requestWithMessage<CashBox>({ url: `/cash-boxes/${id}`, method: 'PATCH', data: payload }),

  openingBalance: (id: string, payload: { currencyId: string; amount: string; note?: string }) =>
    requestWithMessage<unknown>({
      url: `/cash-boxes/${id}/opening-balance`,
      method: 'POST',
      data: payload,
    }),

  transfer: (payload: {
    fromCashBoxId: string;
    toCashBoxId: string;
    currencyId: string;
    amount: string;
    note?: string;
  }) => requestWithMessage<unknown>({ url: '/cash-boxes/transfer', method: 'POST', data: payload }),

  close: (id: string) =>
    requestWithMessage<CashBox>({ url: `/cash-boxes/${id}/close`, method: 'POST' }),
};
