import { describe, expect, it } from 'vitest';

import { CHECK_FALLBACK_INK, checkInk } from './check-ink';

describe('checkInk', () => {
  it('keeps a colour that reads on the paper', () => {
    expect(checkInk('#8B4513')).toBe('#8B4513');
    expect(checkInk('#C62828')).toBe('#C62828');
    expect(checkInk('#1565C0')).toBe('#1565C0');
  });

  it('falls back to dark ink for a colour that vanishes on the paper', () => {
    expect(checkInk('#E0E0E0')).toBe(CHECK_FALLBACK_INK);
    expect(checkInk('#F9A825')).toBe(CHECK_FALLBACK_INK);
  });

  it('returns anything that is not a hex colour unchanged', () => {
    expect(checkInk('var(--shf-amber-deep)')).toBe('var(--shf-amber-deep)');
    expect(checkInk('')).toBe('');
  });

  it('judges against the paper it is given', () => {
    expect(checkInk('#E0E0E0', '#111111')).toBe('#E0E0E0');
  });
});
