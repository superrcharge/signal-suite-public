import { Box, CircularProgress, Typography } from '@mui/material';

interface LoadingSpinnerProps {
  size?: number;
  message?: string;
  fullScreen?: boolean;
}

/**
 * Loading spinner component
 *
 * @example
 * ```tsx
 * // Simple spinner
 * <LoadingSpinner />
 *
 * // With message
 * <LoadingSpinner message="Loading data..." />
 *
 * // Full screen overlay
 * <LoadingSpinner fullScreen message="Please wait..." />
 * ```
 */
export function LoadingSpinner({
  size = 40,
  message,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2
      }}>
      <CircularProgress size={size} aria-label="Loading" />
      {message && (
        <Typography variant="body2" sx={{
          color: 'text.secondary'
        }}>
          {message}
        </Typography>
      )}
    </Box>
  );

  if (fullScreen) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 9999
        }}>
        {content}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        width: '100%'
      }}>
      {content}
    </Box>
  );
}
