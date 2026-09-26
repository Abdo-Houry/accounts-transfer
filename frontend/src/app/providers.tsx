import { useState, type ReactNode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { toApiError } from '@/api/client';
import { AuthProvider } from '@/context/auth-context';
import { I18nProvider, useI18n } from '@/context/i18n-context';
import { ThemeProvider } from '@/context/theme-context';

/**
 * Query defaults.
 *
 * `retry` deliberately skips 4xx: a 403 or a 409 is a decision, not a hiccup,
 * and retrying it only delays the message the operator needs to read.
 */
function createQueryClient(onError: (message: string) => void, networkMessage: string): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const apiError = toApiError(error, networkMessage);
        // Only surface infrastructure failures globally; a screen renders its
        // own error state for anything it asked for explicitly.
        if (apiError.code === 'NETWORK_ERROR') onError(apiError.message);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const apiError = toApiError(error, networkMessage);
          if (apiError.status >= 400 && apiError.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

function QueryLayer({ children }: { children: ReactNode }) {
  const { t, direction } = useI18n();
  const [client] = useState(() =>
    createQueryClient((message) => {
      void import('sonner').then(({ toast }) => toast.error(message));
    }, t('feedback.networkError')),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position={direction === 'rtl' ? 'top-left' : 'top-right'}
        dir={direction}
        richColors
        closeButton
        duration={5000}
        toastOptions={{ style: { fontFamily: 'inherit' } }}
      />
    </QueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryLayer>
          <BrowserRouter>
            <AuthProvider>{children}</AuthProvider>
          </BrowserRouter>
        </QueryLayer>
      </I18nProvider>
    </ThemeProvider>
  );
}
