/**
 * The one look for a control in a catalog page banner.
 *
 * The sheet page and the equipment editor each grew their own: MUI small
 * outlined buttons at about 27px, a 26px Chip for Print / Save PDF, a 26px
 * share trigger, 30px icon squares, and in the editor a Save and a preview
 * toggle in the display face at 11px with 14px side padding - four fonts and
 * five heights in two bars that sit one click apart. Everything here is 30px
 * tall, mono, 0.08em tracking, 4px radius; the only variable is the colour
 * role, which says what the button does:
 *
 * - primary: the amber fill, for the one action the bar is for (Save, Print).
 * - amber:   amber outline, for actions on the record (Edit, Show/Hide Preview, share).
 * - paper:   white outline, for navigation and neutral actions (back, View Sheet, Full Screen).
 * - icon:    a 30px square for a glyph alone, in either outline colour.
 *
 * Plain objects rather than SxProps so a call site can spread one and add a
 * margin; `as const` keeps the literal types MUI's sx accepts.
 */
export const BANNER_BTN_BASE = {
  height: 30,
  minWidth: 0,
  px: 1.5,
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'none',
  lineHeight: 1,
  flexShrink: 0,
  '& .MuiButton-startIcon': { mr: 0.75, ml: -0.25, '& > *:first-of-type': { fontSize: 15 } },
} as const;

/**
 * The content line: 12px in from the content edge on both sides. The catalog
 * cards, the browse search field, every rail title's text, the library and
 * editor rails' first column and the right edge of every DocumentActions
 * cluster all land on it, and the header lockup ends on it (plus the
 * scrollbar). One number so a page that pads by a different amount derives
 * its correction from this rather than restating it in its head.
 *
 * It equals `CONTENT_GUTTER` (1.5 units), which is the same line measured on
 * the pages that inset rather than bleed. Move one and you must move the
 * other, or the two halves of the app stop agreeing on where content starts.
 */
export const CONTENT_LINE = 12;

/**
 * The rail banner's own padding, in spacing units (x8): 12px sides, 6px top
 * and bottom. The sides are `CONTENT_LINE`, so a control in the bar starts on
 * the same line as the content beneath it and `RAIL_TITLE_ML` falls to zero.
 */
export const RAIL_BANNER_PX = CONTENT_LINE / 8;
export const RAIL_BANNER_PY = 0.75;
/**
 * The rail banner's rendered height: its vertical padding twice, the 30px
 * control every banner holds at least one of, and its 2px amber underline.
 * Pages that size a body to `100vh` minus the chrome read this; the editor
 * used to carry its own 36, measured against a banner that no longer exists.
 */
export const RAIL_BANNER_H = RAIL_BANNER_PY * 8 * 2 + BANNER_BTN_BASE.height + 2;

/**
 * The left margin a rail banner's own title needs to reach `CONTENT_LINE`.
 *
 * The bar pads itself by `RAIL_BANNER_PX` (20px) rather than by the content
 * line, because `RailTitle` cancels that padding to draw its rule exactly on
 * the rail's edge. A page with no rail therefore starts 8px short of the line
 * unless it says so - which is how the Comms Library and the Compatibility
 * Matrix ended up carrying a bare `ml: 1` while the Nets and PACE landing
 * pages started at 20px and everything below them at 28.
 *
 * Derived, in spacing units, so it cannot disagree with either number.
 */
export const RAIL_TITLE_ML = (CONTENT_LINE - RAIL_BANNER_PX * 8) / 8

export const BANNER_BTN_PRIMARY_SX = {
  ...BANNER_BTN_BASE,
  fontWeight: 700,
  textTransform: 'uppercase',
  background: 'var(--shf-amber)',
  color: 'var(--shf-black)',
  border: '1px solid transparent',
  '&:hover': { background: 'var(--shf-amber-bright)' },
  '&.Mui-disabled': { background: 'var(--shf-amber)', color: 'var(--shf-black)', opacity: 0.6 },
} as const;

export const BANNER_BTN_AMBER_SX = {
  ...BANNER_BTN_BASE,
  color: 'var(--shf-amber)',
  borderColor: 'var(--shf-amber-dim)',
  '&:hover': { borderColor: 'var(--shf-amber)', background: 'rgba(245,162,31,0.08)' },
} as const;

export const BANNER_BTN_PAPER_SX = {
  ...BANNER_BTN_BASE,
  color: 'var(--shf-paper)',
  borderColor: 'var(--shf-graphite-600)',
  '&:hover': { borderColor: 'var(--shf-graphite-400)', background: 'rgba(255,255,255,0.06)' },
} as const;

/** A 30px square holding one glyph. Spread an outline preset over it for colour. */
export const BANNER_ICON_BTN_SX = {
  width: 30,
  px: 0,
} as const;
