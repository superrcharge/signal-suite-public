import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Snackbar, Alert } from '@mui/material';

type Severity = 'success' | 'warning' | 'error' | 'info';

interface ToastOptions {
  severity?: Severity;
  duration?: number;
}

interface ToastState {
  message: string;
  severity: Severity;
  duration: number;
  key: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const DURATIONS: Record<Severity, number> = {
  success: 3000,
  info: 3000,
  warning: 6000,
  error: 10000,
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const severity = options.severity ?? 'success';
    setToast({
      message,
      severity,
      duration: options.duration ?? DURATIONS[severity],
      key: Date.now(),
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        key={toast?.key}
        open={!!toast}
        autoHideDuration={toast?.duration}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            sx={{ minWidth: 240 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
