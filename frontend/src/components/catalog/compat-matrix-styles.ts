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
