import { ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * The two badge shapes a record list uses, in one place.
 *
 * `StatusBadge`, `SectionBadge` and `TypeBadge` were private components in
 * both `terminals-page.tsx` and `kits-page.tsx`, byte-identical across the two
 * files and importing nothing from each other. What differs between them is
 * the *lookup* - which status maps to which colour - and that is page domain
 * knowledge, so it stays on the page. Only the shape moves here.
 *
 * The two shapes are deliberately different sizes: a pill carries a state and
 * reads first, a tag carries a name and reads second.
 */

interface BadgeColors {
  bg: string;
  color: string;
  border: string;
}

/**
 * The state shape: 5px radius, a little taller, optionally led by a dot.
 * Used for a record's status.
 */
export function PillBadge({ children, dot = false, bg, color, border }: BadgeColors & {
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', px: '9px', py: '3px', borderRadius: '5px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: bg, color, border }}
    >
      {dot && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />}
      {children}
    </Box>
  );
}

/** The name shape: 4px radius, tighter, uppercase. Used for a section or a type. */
export function TagBadge({ children, bg, color, border }: BadgeColors & { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-block', px: '8px', py: '2px', borderRadius: '4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', bgcolor: bg, color, border }}
    >
      {children}
    </Box>
  );
}

/**
 * A section's key in its own colour.
 *
 * The `22` and `44` suffixes are 8-digit-hex alpha on the section colour -
 * about 13% and 27%. They are close to `asset-colors.ts`'s `BADGE_BG_ALPHA`
 * and `BADGE_BORDER_ALPHA` but not equal to them, and they are what shipped,
 * so they are kept rather than quietly re-tuned here.
 */
export function SectionBadge({ section, color }: { section: string; color: string }) {
  return (
    <TagBadge bg={`${color}22`} color={color} border={`1px solid ${color}44`}>
      {section}
    </TagBadge>
  );
}
