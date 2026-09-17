import type { CSSProperties } from 'react';

/**
 * Row-cell styles for `ReferenceLibraryPane`.
 *
 * A separate module for the same reason `shf-form/styles.ts` is one:
 * react-refresh requires a module to export only components, so a style
 * constant beside a component costs fast refresh for the whole file.
 */

/** The leading fixed-width identifier cell: waveform and service abbrevs. */
export const abbrevCell: CSSProperties = {
  width: 80, flexShrink: 0,
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--shf-amber-deep)',
};

/** A trailing fixed-width cell: transport's kind and provider. */
export const trailingCell = (width: number): CSSProperties => ({
  width, flexShrink: 0,
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--shf-graphite-300)',
});

/** The usage count cell, right of the name and left of the row buttons. */
export const usageCell: CSSProperties = {
  width: 92, flexShrink: 0,
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--shf-graphite-400)',
};
