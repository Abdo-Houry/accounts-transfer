import { useQuery } from '@tanstack/react-query';
import { cashBoxesApi, correspondentsApi, currenciesApi, customersApi } from '@/api';
import type { CashBox, Correspondent, Currency, Customer, RateBoardRow } from '@/types/api';

/**
 * Reference data shared by every operation screen.
 *
 * Currencies, cash boxes and the rate board change rarely but are needed by
 * nearly every form, so they are cached for a few minutes and reused instead of
 * being refetched per screen.
 */

export const referenceKeys = {
  currencies: (includeInactive: boolean) => ['currencies', { includeInactive }] as const,
  cashBoxes: (includeClosed: boolean) => ['cash-boxes', { includeClosed }] as const,
  rateBoard: () => ['rate-board'] as const,
  correspondents: () => ['correspondents', 'reference'] as const,
  customerSearch: (term: string) => ['customer-search', term] as const,
};

export function useCurrencies(includeInactive = false) {
  return useQuery<Currency[]>({
    queryKey: referenceKeys.currencies(includeInactive),
    queryFn: () => currenciesApi.list(includeInactive),
    staleTime: 5 * 60_000,
  });
}

export function useCashBoxes(includeClosed = false) {
  return useQuery<CashBox[]>({
    queryKey: referenceKeys.cashBoxes(includeClosed),
    queryFn: () => cashBoxesApi.list(includeClosed),
    staleTime: 5 * 60_000,
  });
}

/**
 * The published buy/sell board. Kept fresher than the rest of the reference
 * data because it is what every quote is priced against.
 */
export function useRateBoard() {
  return useQuery<RateBoardRow[]>({
    queryKey: referenceKeys.rateBoard(),
    queryFn: () => currenciesApi.board(),
    staleTime: 60_000,
  });
}

/**
 * Customer list for the pickers.
 *
 * Runs with an empty term too, which is the point: the picker opens showing the
 * most recent customers so a clerk can pick a regular without knowing how to
 * spell their name. Typing narrows the same list.
 */
export function useCustomerSearch(term: string, limit = 20) {
  const trimmed = term.trim();
  return useQuery<Customer[]>({
    queryKey: referenceKeys.customerSearch(trimmed),
    queryFn: async () => {
      const page = await customersApi.list({ q: trimmed || undefined, limit });
      return page.items;
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** Convenience lookup: `currencyId -> Currency`. */
export function useCurrencyMap(includeInactive = false) {
  const query = useCurrencies(includeInactive);
  const map = new Map((query.data ?? []).map((currency) => [currency.id, currency]));
  return { ...query, map };
}

/**
 * Active partner offices, for the pickers on the transfer and voucher screens.
 *
 * Suspended ones are filtered out here as well as refused at the server, so an
 * operator is never offered a route the posting engine will reject.
 */
export function useCorrespondents() {
  return useQuery<Correspondent[]>({
    queryKey: referenceKeys.correspondents(),
    queryFn: async () => {
      const page = await correspondentsApi.list({ limit: 100 });
      return page.items.filter((one) => one.status === 'ACTIVE');
    },
    staleTime: 5 * 60_000,
  });
}
