import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { roleStyle } from '@/types/role-meta';
import type { Role } from '@/types/roles';

interface RoleBadgeProps {
  role: Role;
  /** 'md' (default) is the Users-page size, unchanged. 'sm' is the header chip. */
  size?: 'sm' | 'md';
  /** Rendered inside the pill after the label - the Users page passes its chevron. */
  trailing?: ReactNode;
  /** Applies the pointer cursor and the hover brightness. */
  interactive?: boolean;
  /**
   * Dims the pill. On the Users page this means "this one is not yours to
   * change"; it is deliberately NOT tied to `interactive`, because a badge
   * that is merely a label - the header chip - is not disabled and should not
   * look it.
   */
  muted?: boolean;
  /** The Users page pins 90 so a column of badges aligns; the header does not. */
  minWidth?: number;
  /**
   * Names the pill for a screen reader and for a test. The Users page's badge
   * is named by the ButtonBase that wraps it, so this is only set where the
   * badge stands alone - the header chip.
   */
  'aria-label'?: string;
}

/**
 * Presentational role pill. Extracted from the Users page's `RoleButton` so
 * the app header and the in-app help dialog can render the same badge
 * without pulling in the table's click/menu wiring.
 */
export function RoleBadge({ role, size = 'md', trailing, interactive = false, muted = false, minWidth, 'aria-label': ariaLabel }: RoleBadgeProps) {
  const s = roleStyle(role);
  const isSm = size === 'sm';

  return (
    <Box
      aria-label={ariaLabel}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: isSm ? 1 : 1.25,
        py: isSm ? 0.25 : 0.5,
        borderRadius: '4px',
        fontSize: isSm ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        bgcolor: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        ...(minWidth !== undefined ? { minWidth } : null),
        justifyContent: trailing || minWidth !== undefined ? 'space-between' : undefined,
        transition: 'filter .12s, background-color .12s',
        cursor: interactive ? 'pointer' : 'default',
        opacity: muted ? 0.7 : 1,
        '&:hover': interactive ? { filter: 'brightness(1.25)' } : undefined,
      }}
    >
      <span>{role}</span>
      {trailing}
    </Box>
  );
}
