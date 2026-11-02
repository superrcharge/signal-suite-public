/** Style constants shared by the matrix panels and the pages that compose them. */

// Wide enough for the longest gutter word either panel draws ("NO BRANCH"),
// so the filter rows and the column groups start their chips on one line.
export const GUTTER_W = 100;

export const PANEL_SX = {
  mb: 2, p: 1.5,
  background: 'var(--shf-graphite-800)',
  border: '1px solid var(--shf-graphite-700)',
  borderRadius: '2px',
} as const;

export const CAPTION_SX = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--shf-graphite-300)',
} as const;
