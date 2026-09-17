import { ReactNode } from 'react';
import { Box, SxProps, Theme, Typography } from '@mui/material';

import { PANEL_SX } from './surface-sx';

/**
 * The row of counts above a list page's toolbar.
 *
 * One definition, for the same reason `PageBanner` is one component: this
 * markup existed five times - terminals and kits byte-identical, contracts
 * with the same props in a different key order and no interaction, users with
 * `mb: 3` and a label missing its `display: block`, and the dashboard with a
 * private `StatPanel`/`Tile` pair. Four of the five had drifted somewhere,
 * and none of the drifts were decisions.
 *
 * The 1px seams between cells are the container's own background showing
 * through a `gap`, not borders on the cells, so a cell can repaint its
 * background on hover without the seams moving.
 */
export function StatStrip({ children, mb = 1.5, ariaLabel, sx }: {
  children: ReactNode;
  /** Space below the strip. `1.5` inside a page banner, `3` when it stands alone. */
  mb?: number;
  /** Present on a non-interactive strip, which needs a name a screen reader can read. */
  ariaLabel?: string;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      sx={[
        {
          display: 'flex',
          ...PANEL_SX,
          overflow: 'hidden',
          gap: '1px',
          // After the spread, so the seams win over the panel's own fill.
          background: 'divider',
          mb,
        },
        sx,
      ] as SxProps<Theme>}
    >
      {children}
    </Box>
  );
}

/**
 * A cell's caption. Exported because the dashboard's tiles keep their own
 * grid layout - they are not a flex strip - but must not restate the type.
 */
export function StatLabel({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Typography
      variant="caption"
      sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', color: color ?? 'text.secondary', display: 'block' }}
    >
      {children}
    </Typography>
  );
}

/** A cell's number. Exported for the same reason as `StatLabel`. */
export function StatValue({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Typography sx={{ fontSize: 22, fontWeight: 800, color: color ?? 'text.primary', lineHeight: 1, my: 0.25 }}>
      {children}
    </Typography>
  );
}

/**
 * One count in a `StatStrip`.
 *
 * `onClick` is what makes it a filter: without one the cell carries no
 * cursor, no hover and no active bar, which is correct on the users and
 * contracts strips where there is no filter for a cell to drive. Passing
 * `active` without `onClick` would draw a state nothing can change, so the
 * bar is drawn only when the cell is interactive.
 */
export function StatCell({ label, value, hint, color, active = false, onClick }: {
  label: ReactNode;
  value: ReactNode;
  /** The line under the number - what the count means. */
  hint?: ReactNode;
  /** The label's colour, and the active underline's. */
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        bgcolor: 'background.paper',
        p: 1.5,
        ...(interactive && {
          cursor: 'pointer',
          transition: 'background .12s',
          position: 'relative',
          userSelect: 'none',
          '&:hover': { bgcolor: 'action.hover' },
          ...(active && {
            bgcolor: 'action.selected',
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              bgcolor: color,
            },
          }),
        }),
      }}
    >
      <StatLabel color={color}>{label}</StatLabel>
      <StatValue>{value}</StatValue>
      {hint !== undefined && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{hint}</Typography>
      )}
    </Box>
  );
}
