import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MsalProvider } from '@azure/msal-react';
import { AuthProvider, ThemeProvider, ToastProvider } from '@/contexts';
import { queryClient } from '@/services';
import { ErrorBoundary } from '@/components/common';
import { msalInstance } from '@/auth/msal-config';
import { router } from '@/routes';

/**
 * Root application component with all providers
 */
export function App() {
  return (
    <ErrorBoundary>
      <MsalProvider instance={msalInstance}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </MsalProvider>
    </ErrorBoundary>
  );
}
