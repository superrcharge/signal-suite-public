/**
 * The one look for a shell surface: the bordered panels, tables and stat
 * strips on the list and admin pages.
 *
 * This is the shell counterpart to `banner-controls.ts`, which owns the
 * catalog/sheet surfaces. The two systems stay separate on purpose - a shell
 * page styles with MUI `sx` and the palette, a sheet page with `var(--shf-*)`
 * - but each needs exactly one source for its own values, and the shell had
 * none: `borderRadius: '10px'` was written out fourteen times, the table head
 * rule four times as a page-local `HEAD_SX` plus once inline and once at a
 * different size, and the stat strip five times.
 *
 * Plain objects rather than SxProps so a call site can spread one and add a
 * margin; `as const` keeps the literal types MUI's sx accepts.
 */

/**
 * The shell's container radius.
 *
 * Note it is not `theme.shape.borderRadius` (4) and not the `'8px'` the theme
 * sets on MuiPaper: every shell panel overrode both with a literal 10px, so
 * this records what the app actually looks like rather than what the theme
 * claims. Reconciling the three is a theme change, not a token change, and is
 * deliberately not done here.
 */
export const SURFACE_RADIUS = '10px'

/** A bordered panel on the page background: tables, stat strips, filter bars. */
export const PANEL_SX = {
  border: 1,
  borderColor: 'divider',
  borderRadius: SURFACE_RADIUS,
  bgcolor: 'background.paper',
} as const

/**
 * A table's header cells.
 *
 * Applied per `TableCell` rather than through a `& th` selector on the
 * `TableHead`, because that is how five of the six call sites already did it
 * and the sixth - contracts - is the one that had drifted (0.72rem, 0.05em,
 * and a `text.secondary` colour nothing else set).
 */
export const TABLE_HEAD_SX = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  // The amber, as the palette rather than the hex - `check-ui-tokens.mjs`
  // fails a literal. It is the same colour `PageTitle` uses and the same one
  // the catalog sheets' column headers already had, so a shell table and a
  // sheet table finally label their columns alike.
  color: 'primary.main',
  // Required by `stickyHeader`, which otherwise paints the pinned row with
  // MUI's own `background.default` - the page colour, not the panel's - so it
  // reads as a grey band across the top of the table while the rows slide
  // under it. A no-op on the tables that do not pin, whose panel is this
  // colour anyway.
  backgroundColor: 'background.paper',
} as const

/** A cell that should take only the width its content needs. */
export const TIGHT_CELL_SX = { whiteSpace: 'nowrap', width: '1%' } as const

/**
 * A hoverable table row.
 *
 * One mechanism rather than three: this, MUI's `hover` prop, and nothing at
 * all were each in use. `hover` paints `action.hover` too, but only on rows
 * inside a `TableBody`, so a row used as a header or a footer silently loses
 * it - which is why the explicit rule wins.
 */
export const ROW_HOVER_SX = { '&:hover': { bgcolor: 'action.hover' } } as const

/**
 * A filter/scope `ToggleButtonGroup` in a list page's toolbar.
 *
 * Lived inside `scope-switch.tsx` as a module-local const while three of the
 * groups sitting in the same toolbar restated it inline.
 */
export const TOGGLE_SX = {
  '& .MuiToggleButton-root': {
    px: 1.5,
    height: 40,
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'none',
    border: '1px solid',
    borderColor: 'divider',
  },
} as const
