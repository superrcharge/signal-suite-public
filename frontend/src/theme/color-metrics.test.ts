import { describe, it, expect } from 'vitest';
import { oklab, deltaOk, deltaOkUnder, simulate, pairs } from './color-metrics';

describe('oklab', () => {
  // Reference values for the OKLab transform: pure white is L=1 with no chroma,
  // pure black is the origin. If the matrices are ever mistyped these move.
  it('maps white to L=1 with no chroma', () => {
    const [L, a, b] = oklab('#ffffff');
    expect(L).toBeCloseTo(1, 3);
    expect(a).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('maps black to the origin', () => {
    for (const v of oklab('#000000')) expect(v).toBeCloseTo(0, 3);
  });
});

describe('deltaOk', () => {
  it('is zero for identical colors', () => {
    expect(deltaOk('#39d3f0', '#39d3f0')).toBe(0);
  });

  it('is symmetric', () => {
    expect(deltaOk('#1f6feb', '#f85149')).toBeCloseTo(deltaOk('#f85149', '#1f6feb'), 10);
  });

  it('separates black and white by the full lightness range', () => {
    expect(deltaOk('#000000', '#ffffff')).toBeCloseTo(1, 2);
  });

  it('ranks an obviously different pair above a near-identical one', () => {
    expect(deltaOk('#1f6feb', '#3fb950')).toBeGreaterThan(deltaOk('#39d3f0', '#22d3ee'));
  });
});

describe('simulate', () => {
  it('is a no-op for normal vision', () => {
    expect(simulate('#e3b341', 'normal')).toBe('#e3b341');
  });

  it('returns a valid hex for every dichromacy', () => {
    for (const vision of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      expect(simulate('#f0883e', vision)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('leaves grays essentially unchanged', () => {
    // A neutral has no red-green or blue-yellow information to lose.
    expect(deltaOk('#8b949e', simulate('#8b949e', 'deuteranopia'))).toBeLessThan(0.02);
  });

  // The finding that drove this module: ALERT yellow and Reserved orange are
  // comfortably apart in normal vision and nearly identical to a deuteranope.
  it('collapses ALERT yellow and Reserved orange under deuteranopia', () => {
    expect(deltaOk('#e3b341', '#f0883e')).toBeGreaterThan(0.10);
    expect(deltaOkUnder('#e3b341', '#f0883e', 'deuteranopia')).toBeLessThan(0.03);
  });
});

describe('pairs', () => {
  it('produces every unordered pair once', () => {
    expect(pairs(['a', 'b', 'c'])).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']]);
  });

  it('is empty for fewer than two items', () => {
    expect(pairs(['only'])).toEqual([]);
    expect(pairs([])).toEqual([]);
  });
});
