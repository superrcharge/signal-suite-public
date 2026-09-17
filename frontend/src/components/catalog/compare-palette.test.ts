import { describe, it, expect } from 'vitest';
import { DARK, INK, cmp, contrastRatio, paletteVars, type ComparePalette } from './compare-palette';

describe('contrastRatio', () => {
  it('is 21 for pure black on pure white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#25292D', '#25292D')).toBeCloseTo(1, 6);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#F5A21F', '#141618')).toBeCloseTo(
      contrastRatio('#141618', '#F5A21F'),
      6,
    );
  });
});

// WCAG AA for normal text is 4.5:1. Every pairing a reader actually reads
// text against must clear it in both schemes, screen and paper alike.
describe.each([
  ['DARK', DARK],
  ['INK', INK],
])('%s meets AA text contrast', (_name, palette: ComparePalette) => {
  it('fg, label and na all read against both row grounds', () => {
    for (const key of ['fg', 'label', 'na'] as const) {
      expect(contrastRatio(palette[key], palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[key], palette.bgAlt)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('headText reads against head', () => {
    expect(contrastRatio(palette.headText, palette.head)).toBeGreaterThanOrEqual(4.5);
  });

  it('groupText reads against group', () => {
    expect(contrastRatio(palette.groupText, palette.group)).toBeGreaterThanOrEqual(4.5);
  });

  it('chipFg reads against chipBg', () => {
    expect(contrastRatio(palette.chipFg, palette.chipBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('faint (the blank-cell glyph and unit suffixes)', () => {
  // INK has no background to hide behind once printed, so it holds the
  // full 4.5:1 text threshold like everything else.
  it('meets 4.5:1 in INK against both row grounds', () => {
    expect(contrastRatio(INK.faint, INK.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(INK.faint, INK.bgAlt)).toBeGreaterThanOrEqual(4.5);
  });

  // DARK deliberately keeps this quieter than a real value: it is
  // secondary text, measured at roughly 3.7:1 on graphite-900, and the
  // blank cell is told apart from n/a by its glyph, not by being unreadable.
  // The floor here is 3, not 4.5, on purpose.
  it('meets a 3:1 floor in DARK against both row grounds', () => {
    expect(contrastRatio(DARK.faint, DARK.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK.faint, DARK.bgAlt)).toBeGreaterThanOrEqual(3);
  });
});

describe('DARK pins today\'s shipped screen colours', () => {
  // A palette edit must not silently restyle the live page. If one of these
  // ever needs to change, it is a deliberate screen redesign, not a
  // refactor, and this test is meant to make that visible.
  it('matches CompareMatrix.tsx\'s current hardcoded values', () => {
    expect(DARK.bg).toBe('#141618');
    expect(DARK.bgAlt).toBe('#1C1F22');
    expect(DARK.fg).toBe('#F4F2EC');
    expect(DARK.na).toBe('#9AA0A8');
    expect(DARK.faint).toBe('#6B7178');
    expect(DARK.accent).toBe('#F5A21F');
  });
});

describe('paletteVars', () => {
  it('produces one kebab-cased --cmp- entry per palette key', () => {
    const vars = paletteVars(DARK);
    expect(vars['--cmp-bg']).toBe(DARK.bg);
    expect(vars['--cmp-bg-alt']).toBe(DARK.bgAlt);
    expect(vars['--cmp-chip-border']).toBe(DARK.chipBorder);
    expect(vars['--cmp-guide-tag-bg']).toBe(DARK.guideTagBg);
    expect(Object.keys(vars)).toHaveLength(Object.keys(DARK).length);
  });

  it('agrees with cmp() about the property name it points at', () => {
    expect(cmp('bgAlt')).toBe('var(--cmp-bg-alt)');
    expect(cmp('chipBorder')).toBe('var(--cmp-chip-border)');
  });
});

describe('DARK and INK', () => {
  it('declare exactly the same set of keys', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(INK).sort());
  });
});
