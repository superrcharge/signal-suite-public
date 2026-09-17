/**
 * Asset accent colors - the single source of truth for the status, kit-type
 * and contract-urgency palettes that the terminals, kits, dashboard and
 * contracts pages all draw from.
 *
 * These used to live as bare hex literals (and their rgba tints) copied across
 * ten files, which made a recolor a find-and-replace exercise. Import from
 * here instead of restating a hex anywhere in `src/`.
 */

/**
 * The base accent hues. Everything else in this file is a semantic alias onto
 * one of these, so a hue only ever appears once as a literal.
 */
export const PALETTE = {
  blue:    '#1f6feb',
  green:   '#3fb950',
  yellow:  '#e3b341',
  purple:  '#a371f7',
  orange:  '#f0883e',
  red:     '#f85149',
  teal:    '#2dd4bf',
  cyan:    '#39d3f0',
  magenta: '#e879f9',
  violet:  '#d2a8ff',
  gray:    '#8b949e',
} as const;

/**
 * Terminal family tiles on the dashboard. A separate concept from
 * {@link STATUS_COLORS}: these identify a hardware family, not an operational
 * state, and they may reuse section-picker hues.
 */
export const TERMINAL_FAMILY_COLORS = {
  starshield: PALETTE.cyan,
  paradigm:   PALETTE.violet,
  oneweb:     PALETTE.teal,
} as const;

/**
 * Equipment catalog tiles. Kept separate from {@link TERMINAL_FAMILY_COLORS}
 * rather than merged: the two render in different dashboard panels, so they
 * are free to reuse the same hues and only have to be distinct within a panel.
 */
export const CATALOG_COLORS = {
  satcom:    PALETTE.cyan,
  radio:     PALETTE.purple,
  waveforms: PALETTE.teal,
} as const;

/**
 * Fleet status palette, shared by the terminal and kit stat strips and status
 * badges. Hard-reserved: these hues never appear in the section color picker
 * (see {@link SECTION_COLOR_PALETTE}).
 *
 * The three ALERT variants (`alert`, `alert-blue`, `alert-green`) all render
 * with `alert` yellow - the distinction is carried by the label, not the color.
 */
export const STATUS_COLORS = {
  total:     PALETTE.blue,
  available: PALETTE.green,
  alert:     PALETTE.yellow,
  onMission: PALETTE.purple,
  reserved:  PALETTE.orange,
  inop:      PALETTE.red,
} as const;

/**
 * Kit type badge palette, keyed by the `kit.type` values in `kit-constants`.
 *
 * Remote is cyan rather than blue and IFK is magenta rather than purple, both
 * deliberately: blue is reserved for Total tiles and purple is the On Mission
 * status color, and all of them render side by side in the kits table.
 */
export const KIT_TYPE_COLORS = {
  remote: PALETTE.cyan,
  ifk:    PALETTE.magenta,
  atk:    PALETTE.teal,
} as const;

/**
 * Contract POP-expiry urgency palette. Shares hues with {@link STATUS_COLORS}
 * but is a separate concept - recoloring "INOP" should not move "Expiring".
 */
export const CONTRACT_URGENCY_COLORS = {
  total:    PALETTE.blue,
  expiring: PALETTE.red,
  caution:  PALETTE.orange,
  watch:    PALETTE.yellow,
} as const;

/**
 * Authorization role palette, shared by the Users page role badges and the
 * Users stat strip.
 *
 * `total` is the usual blue, matching every other stat strip. Editor is green
 * rather than the blue it used before this palette existed, because the Total
 * tile now renders beside it in that same blue. RTO is purple to match
 * {@link CATALOG_COLORS}.radio - it is the role scoped to the radio side of
 * the catalog, so it reads as the same concept.
 *
 * Planner is violet, and that was measured rather than chosen by eye. Note
 * this object is a plain literal, not `Record<Role, ...>` - unlike
 * `ROLE_STYLE` on the Users page, a missing entry here compiles and fails at
 * runtime - and it feeds `co-occurrence`'s 'users stat strip' context, which
 * holds every role colour OKLab-distinct from every other under dichromacy
 * simulation. Violet is the widest-margin palette entry against the five
 * above (worst case 0.104 against rto under tritanopia, clear even of the
 * stricter normal-vision floor); yellow, teal, cyan and magenta also pass but
 * by less. It doubles as {@link TERMINAL_FAMILY_COLORS}.paradigm, which never
 * co-renders with a role badge - the same licence RTO takes with radio.
 */
export const ROLE_COLORS = {
  total:   PALETTE.blue,
  admin:   PALETTE.red,
  editor:  PALETTE.green,
  viewer:  PALETTE.gray,
  rto:     PALETTE.purple,
  planner: PALETTE.violet,
} as const;

/** Neutral gray for unassigned sections and unknown/fallback buckets. */
export const NEUTRAL_COLOR = PALETTE.gray;

/**
 * Swatches offered by the section color pickers in the terminal drawer, kit
 * drawer and section edit dialog. Deliberately disjoint from
 * {@link STATUS_COLORS} - a section must never be mistakable for a status at a
 * glance - while staying adjacent enough to feel like the same design system.
 * `asset-colors.test.ts` asserts that disjointness.
 */
export const SECTION_COLOR_PALETTE = [
  '#39d3f0', '#22d3ee', '#2dd4bf', '#00d4aa',
  '#34d399', '#56d364', '#a8ff3e', '#6ee7b7',
  '#e879f9', '#f472b6', '#ff96ca', '#f9a8d4',
  '#818cf8', '#60a5fa', '#79c0ff', '#a5f3fc',
  '#d2a8ff', '#c4b5fd', '#86efac', '#5eead4',
] as const;

/**
 * Render a `#rrggbb` hex as an `rgba()` string, for the translucent badge
 * backgrounds and borders. Emits no spaces so the output is byte-identical to
 * the literals this replaced (e.g. `rgba(63,185,80,0.12)`).
 */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Badge tint opacities, matched to the existing badge styling. */
export const BADGE_BG_ALPHA = 0.12;
export const BADGE_BORDER_ALPHA = 0.25;

/** Convenience: the `{ bg, color, border }` triple used by the pill badges. */
export function badgeStyle(color: string): { bg: string; color: string; border: string } {
  return {
    bg: withAlpha(color, BADGE_BG_ALPHA),
    color,
    border: `1px solid ${withAlpha(color, BADGE_BORDER_ALPHA)}`,
  };
}
