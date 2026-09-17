/**
 * The one width for a list page's search field, so Terminals, Kits and
 * Contracts agree and the toolbar does not jump when the scope switch flips
 * between the first two. Terminals and Kits had `minWidth: 280, maxWidth: 400`
 * and Contracts a fixed 260; the maintainer asked for a third off, found that
 * too short, and settled halfway between the two.
 *
 * `flex: 1` lets it take slack in a wrapping toolbar up to the cap; `minWidth`
 * keeps the placeholder legible when the row is crowded.
 *
 * Its own module for the same reason as header-trigger-sx.ts: the pages that
 * share it import from here rather than from each other.
 */
export const SEARCH_FIELD_SX = { minWidth: 235, flex: 1, maxWidth: 335 } as const;
