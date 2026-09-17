/**
 * The shell's dimensions, in a module that imports nothing.
 *
 * They lived in `main-layout.tsx`, which imports `header.tsx` and
 * `sidebar.tsx`. That was fine while only pages read them, but the sidebar
 * needs `HEADER_HEIGHT` for the spacer that clears the fixed AppBar, and
 * importing it from `main-layout` would close a cycle between the two. A
 * cyclic import graph is legal and builds clean, and this repo has already
 * shipped one blank white screen because of a cycle in the emitted chunks
 * (an earlier release, see AGENTS.md) - so the constants move to a leaf instead.
 *
 * `main-layout.tsx` re-exports `HEADER_HEIGHT` and `CONTENT_GUTTER`, which is
 * where every page already imports them from.
 */

/** The sidebar's width, and the left offset of the header and main content. */
export const SIDEBAR_WIDTH = 240;

/** The fixed AppBar's height. Anything sizing to the viewport subtracts it. */
export const HEADER_HEIGHT = 64;

/**
 * The gutter around page content, in MUI spacing units (1.5 = 12px).
 *
 * Exported because a full-width banner has to cancel it exactly, and seven
 * pages used to restate it as a bare `-3` in a file that never imported this
 * one. Changing the padding here would have quietly broken every one of them.
 * PageBanner derives its bleed from this value instead.
 *
 * It equals `CONTENT_LINE`, and the two move together or the app goes back to
 * having two content lines: this is the inset the list and admin pages use,
 * while the catalog, PACE and sheet surfaces bleed straight past it and inset
 * by `CONTENT_LINE` instead. Changing one without the other is exactly how the
 * app came to have 24px on one half and 28px on the other.
 *
 * 12px because that is the gap between the stat strip and the toolbar beneath
 * it, so a page's outer inset and its internal rhythm are one number rather
 * than two. It also pays for the sticky table header: a narrower gutter gives
 * the list tables 32px more width and the banner 16px less height, since
 * `PageBanner`'s plain variant pads its top by this value.
 */
export const CONTENT_GUTTER = 1.5;
