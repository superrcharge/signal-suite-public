import { ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Empty state component for when there's no data to display
 *
 * @example
 * ```tsx
 * <EmptyState
 *   title="No users found"
 *   description="Get started by creating your first user."
 *   action={{
 *     label: "Add User",
 *     onClick: () => navigate('/users/new')
 *   }}
 * />
 * ```
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 8,
        px: 3
      }}>
      <Box
        sx={{
          color: 'text.secondary',
          mb: 2,
        }}
      >
        {icon ?? <InboxIcon sx={{ fontSize: 64 }} />}
      </Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            mb: 3,
            maxWidth: 400
          }}>
          {description}
        </Typography>
      )}
      {action && (
        <Button variant="contained" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Box>
  );
}
