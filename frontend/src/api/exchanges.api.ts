import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type { CurrencyExchange, ExchangeQuote } from '@/types/api';
import type { ExchangeStatus, ExchangeType } from '@/types/enums';

export interface ExchangeQuotePayload {
  fromCurrencyId: string;
  fromAmount: string;
  toCurrencyId: string;
  rate?: string | null;
  commissionAmount?: string | null;
}

export interface CreateExchangePayload extends ExchangeQuotePayload {
  cashBoxId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
}

export interface ExchangeListParams {
  page?: number;
  limit?: number;
  q?: string;
  type?: ExchangeType;
  status?: ExchangeStatus;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  createdById?: string;
  from?: string;
  to?: string;
}

export const exchangesApi = {
  list: (params: ExchangeListParams) =>
    requestPage<CurrencyExchange>({ url: '/exchanges', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<CurrencyExchange>({ url: `/exchanges/${id}`, method: 'GET' }),

  quote: (payload: ExchangeQuotePayload) =>
    request<ExchangeQuote>({ url: '/exchanges/quote', method: 'POST', data: payload }),

  create: (payload: CreateExchangePayload) =>
    requestWithMessage<CurrencyExchange>({ url: '/exchanges', method: 'POST', data: payload }),

  reverse: (id: string, reason: string) =>
    requestWithMessage<CurrencyExchange>({
      url: `/exchanges/${id}/reverse`,
      method: 'POST',
      data: { reason },
    }),
};
