import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
// Renders under the theme the app actually serves. This mounted the light
// palette until the app went dark-only, which meant the whole suite exercised
// colours no user can now reach.
import { darkTheme } from '@/theme';
import { ToastProvider } from '@/contexts';

// Create a new QueryClient for each test to ensure isolation
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperOptions {
  initialEntries?: string[];
  useMemoryRouter?: boolean;
}

interface AllTheProvidersProps {
  children: ReactNode;
  options?: WrapperOptions;
}

// eslint-disable-next-line react-refresh/only-export-components
function AllTheProviders({ children, options = {} }: AllTheProvidersProps) {
  const queryClient = createTestQueryClient();
  const { initialEntries = ['/'], useMemoryRouter = false } = options;

  const Router = useMemoryRouter
    ? ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      )
    : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <MuiThemeProvider theme={darkTheme}>
        <CssBaseline />
        <ToastProvider>
          <Router>{children}</Router>
        </ToastProvider>
      </MuiThemeProvider>
    </QueryClientProvider>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  wrapperOptions?: WrapperOptions;
}

function customRender(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { wrapperOptions, ...renderOptions } = options;

  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders options={wrapperOptions}>{children}</AllTheProviders>
    ),
    ...renderOptions,
  });
}

// Re-export everything from testing-library
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';
export { customRender as render };
export { createTestQueryClient };

// Helper for rendering with specific route
export function renderWithRoute(ui: ReactElement, route: string) {
  return customRender(ui, {
    wrapperOptions: {
      useMemoryRouter: true,
      initialEntries: [route],
    },
  });
}

// Helper for testing hooks that need providers
export function createQueryWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
