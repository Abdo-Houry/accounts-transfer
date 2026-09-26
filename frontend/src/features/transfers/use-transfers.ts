import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { transfersApi, type CreateTransferPayload, type TransferListParams, type TransferQuotePayload } from '@/api/transfers.api';
import { toApiError } from '@/api/client';
import { useI18n } from '@/context/i18n-context';
import { invalidateFinancialQueries } from '@/features/reference/financial-keys';

export const transferKeys = {
  all: ['transfers'] as const,
  list: (params: TransferListParams) => ['transfers', 'list', params] as const,
  detail: (id: string) => ['transfers', 'detail', id] as const,
  history: (id: string) => ['transfers', 'history', id] as const,
  receipt: (id: string) => ['transfers', 'receipt', id] as const,
  lookup: (params: Record<string, string | undefined>) => ['transfers', 'lookup', params] as const,
};

export function useTransfers(params: TransferListParams) {
  return useQuery({
    queryKey: transferKeys.list(params),
    queryFn: () => transfersApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useTransfer(id: string | undefined) {
  return useQuery({
    queryKey: transferKeys.detail(id ?? ''),
    queryFn: () => transfersApi.detail(id as string),
    enabled: Boolean(id),
  });
}

export function useTransferHistory(id: string | undefined) {
  return useQuery({
    queryKey: transferKeys.history(id ?? ''),
    queryFn: () => transfersApi.history(id as string),
    enabled: Boolean(id),
  });
}

export function useTransferReceipt(id: string | undefined) {
  return useQuery({
    queryKey: transferKeys.receipt(id ?? ''),
    queryFn: () => transfersApi.receipt(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Live pricing for the send screen.
 *
 * Runs only once the amount and currency are actually usable, and re-prices on
 * every meaningful change so the operator can read the payout figure out loud
 * before committing. The server prices the deal again on submit - this is a
 * preview, never the source of the saved numbers.
 */
export function useTransferQuote(payload: TransferQuotePayload | null) {
  return useQuery({
    queryKey: ['transfers', 'quote', payload],
    queryFn: () => transfersApi.quote(payload as TransferQuotePayload),
    enabled: Boolean(payload?.currencyId && payload?.amount && Number(payload.amount) > 0),
    staleTime: 0,
    retry: false,
  });
}

/** Shared success/failure handling for every transfer mutation. */
function useTransferMutationHandlers() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return {
    onSuccess: (message: string) => {
      toast.success(message);
      invalidateFinancialQueries(queryClient);
    },
    onError: (error: unknown) => {
      // The backend already localised the sentence; showing it verbatim is what
      // turns "409 Conflict" into "the USD box only holds 500".
      toast.error(toApiError(error, t('feedback.networkError')).message);
    },
  };
}

export function useCreateTransfer() {
  const handlers = useTransferMutationHandlers();
  return useMutation({
    mutationFn: (payload: CreateTransferPayload) => transfersApi.create(payload),
    onSuccess: (result) => handlers.onSuccess(result.message),
    onError: handlers.onError,
  });
}

export function useSendTransfer() {
  const handlers = useTransferMutationHandlers();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => transfersApi.send(id, reason),
    onSuccess: (result) => handlers.onSuccess(result.message),
    onError: handlers.onError,
  });
}

export function useReceiveTransfer() {
  const handlers = useTransferMutationHandlers();
  return useMutation({
    mutationFn: ({
      id,
      payoutCashBoxId,
      receivedByName,
    }: {
      id: string;
      payoutCashBoxId?: string | null;
      receivedByName?: string | null;
    }) => transfersApi.receive(id, { payoutCashBoxId, receivedByName }),
    onSuccess: (result) => handlers.onSuccess(result.message),
    onError: handlers.onError,
  });
}

export function useCancelTransfer() {
  const handlers = useTransferMutationHandlers();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      refundCommission,
    }: {
      id: string;
      reason: string;
      refundCommission?: boolean;
    }) => transfersApi.cancel(id, { reason, refundCommission }),
    onSuccess: (result) => handlers.onSuccess(result.message),
    onError: handlers.onError,
  });
}

export function useLookupTransfer() {
  const { t } = useI18n();
  return useMutation({
    mutationFn: (params: { transferNo?: string; phone?: string; beneficiaryName?: string }) =>
      transfersApi.lookup(params),
    onError: (error: unknown) => {
      toast.error(toApiError(error, t('feedback.networkError')).message);
    },
  });
}
