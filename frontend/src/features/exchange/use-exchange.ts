import { useMutation, useQuery } from '@tanstack/react-query';
import {
  exchangesApi,
  type CreateExchangePayload,
  type ExchangeListParams,
  type ExchangeQuotePayload,
} from '@/api/exchanges.api';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';

export const exchangeKeys = {
  all: ['exchanges'] as const,
  list: (params: ExchangeListParams) => ['exchanges', 'list', params] as const,
  detail: (id: string) => ['exchanges', 'detail', id] as const,
};

export function useExchanges(params: ExchangeListParams) {
  return useQuery({
    queryKey: exchangeKeys.list(params),
    queryFn: () => exchangesApi.list(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * Live pricing for the exchange desk. Disabled until both currencies and a
 * positive amount are present, so the operator never sees a half-formed quote.
 */
export function useExchangeQuote(payload: ExchangeQuotePayload | null) {
  return useQuery({
    queryKey: ['exchanges', 'quote', payload],
    queryFn: () => exchangesApi.quote(payload as ExchangeQuotePayload),
    enabled: Boolean(
      payload?.fromCurrencyId &&
        payload?.toCurrencyId &&
        payload.fromCurrencyId !== payload.toCurrencyId &&
        Number(payload?.fromAmount) > 0,
    ),
    retry: false,
  });
}

export function useCreateExchange() {
  const feedback = useMutationFeedback([['exchanges'], ['cash-boxes'], ['dashboard']]);
  return useMutation({
    mutationFn: (payload: CreateExchangePayload) => exchangesApi.create(payload),
    ...feedback,
  });
}

export function useReverseExchange() {
  const feedback = useMutationFeedback([['exchanges'], ['cash-boxes'], ['dashboard']]);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      exchangesApi.reverse(id, reason),
    ...feedback,
  });
}
