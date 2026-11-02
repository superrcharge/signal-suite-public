import type { CSSProperties } from 'react';

/**
 * Row-cell styles for `ReferenceLibraryPane`.
 *
 * A separate module for the same reason `shf-form/styles.ts` is one:
 * react-refresh requires a module to export only components, so a style
 * constant beside a component costs fast refresh for the whole file.
 */

/**
 * The leading fixed-width identifier cell: waveform and service abbrevs.
 * Full-strength amber, not --shf-amber-deep: the abbrev is what a reader scans
 * the list by, and the deep shade read as disabled on the dark rows.
 */
export const abbrevCell: CSSProperties = {
  width: 80, flexShrink: 0,
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--shf-amber)',
};

/**
 * A trailing fixed-width cell: transport's kind and provider. The description
 * line's type, not mono caps: plain data set in a different face from its
 * neighbours reads as if it meant something, and here it never did.
 */
export const trailingCell = (width: number): CSSProperties => ({
  width, flexShrink: 0,
  fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
});

/** The usage count cell, right of the name and left of the row buttons. */
export const usageCell: CSSProperties = {
  width: 92, flexShrink: 0,
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--shf-graphite-400)',
};
