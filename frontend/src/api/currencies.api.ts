import { request, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type { Currency, ExchangeRate, RateBoardRow } from '@/types/api';

export interface CurrencyPayload {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  symbol?: string;
  decimalPlaces?: number;
  sortOrder?: number;
}

export interface RatePayload {
  currencyId: string;
  buyRate: string;
  sellRate: string;
  note?: string;
}

export const currenciesApi = {
  list: (includeInactive = false) =>
    request<Currency[]>({ url: '/currencies', method: 'GET', params: { includeInactive } }),

  create: (payload: CurrencyPayload) =>
    requestWithMessage<Currency>({ url: '/currencies', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CurrencyPayload> & { isActive?: boolean }) =>
    requestWithMessage<Currency>({ url: `/currencies/${id}`, method: 'PATCH', data: payload }),

  board: () => request<RateBoardRow[]>({ url: '/exchange-rates/current', method: 'GET' }),

  history: (params: { currencyId?: string; from?: string; to?: string; limit?: number }) =>
    request<ExchangeRate[]>({
      url: '/exchange-rates/history',
      method: 'GET',
      params: cleanParams(params),
    }),

  setRate: (payload: RatePayload) =>
    requestWithMessage<ExchangeRate>({ url: '/exchange-rates', method: 'POST', data: payload }),

  setRatesBulk: (rates: RatePayload[]) =>
    requestWithMessage<ExchangeRate[]>({
      url: '/exchange-rates/bulk',
      method: 'POST',
      data: { rates },
    }),
};
