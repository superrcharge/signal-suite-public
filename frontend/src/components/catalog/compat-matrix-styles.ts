/**
 * Cell and header styling for the two compatibility cross-tabs: the per-radio
 * one on a data sheet (`CompatibilityMatrix`) and the joint one across every
 * asset (`/catalog/compatibility`). Shared so the two read as one visual
 * language, not forked copies that drift the way the page banners once did.
 */

export function matrixHeaderCell(left: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--fg-2)',
    background: 'rgba(0,0,0,0.04)',
    borderBottom: '1px solid var(--border-soft)',
    textAlign: left ? 'left' : 'center',
  };
}

export function matrixRowLabel(isLast: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
    borderRight: '1px solid var(--border-soft)',
  };
}

export function matrixCell(isLast: boolean): React.CSSProperties {
  return {
    padding: '7px 8px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-soft)',
    borderRight: '1px solid var(--border-soft)',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.01)',
  };
}

/** The ✓ glyph. */
export const matrixCheck: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
  lineHeight: 1, color: 'var(--shf-amber-deep)',
};

/**
 * One branch's check in a supported cell. The glyph shrinks with the count
 * so four fit the matrix's 76px minimum column on one line.
 */
export function branchCheck(color: string, count: number): React.CSSProperties {
  return { ...matrixCheck, color, fontSize: count <= 1 ? 18 : count === 2 ? 15 : 12 };
}

/** The EMPTY_VALUE dash for a miss. */
export const matrixMiss: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)',
};

/** A waveform row's label. */
export const matrixWaveformLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
  letterSpacing: '0.04em', textTransform: 'uppercase',
  color: 'var(--shf-amber-deep)',
};

/**
 * The printed matrix's geometry, in the same unzoomed print pixels as
 * `PAGE_W`. The label column is fixed so the page arithmetic holds: a page
 * at zoom z holds floor((PAGE_W / z - MATRIX_LABEL_COL) / MATRIX_MIN_COL)
 * asset columns. The minimum is narrower than the compare sheet's 118, since
 * a column here carries a label, its branch chips and checks, not values.
 */
export const MATRIX_LABEL_COL = 150;
export const MATRIX_MIN_COL = 72;
