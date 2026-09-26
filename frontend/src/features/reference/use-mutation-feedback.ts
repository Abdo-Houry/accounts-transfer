import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toApiError } from '@/api/client';
import { useI18n } from '@/context/i18n-context';
import { invalidateFinancialQueries } from './financial-keys';

/**
 * Standard feedback for a write.
 *
 * The backend already returns a localised, specific sentence ("the USD box only
 * holds 500, you need 1,000"), so both the success and the failure toast simply
 * show it - the UI never invents its own wording for a financial outcome.
 */
export function useMutationFeedback(invalidateKeys: string[][] = []) {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return {
    onSuccess: (result: { message: string }) => {
      toast.success(result.message);
      // The caller's own keys still run first - a screen may cache something
      // outside the financial family - and then every financial view is
      // refreshed, so a balance is never left stale on an open page.
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      invalidateFinancialQueries(queryClient);
    },
    onError: (error: unknown) => {
      toast.error(toApiError(error, t('feedback.networkError')).message);
    },
  };
}
