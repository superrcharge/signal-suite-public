import { contrastRatio } from '@/components/catalog/compare-palette';

/** The matrix paper, `--shf-paper` in catalog-tokens.css, as the hex the contrast maths needs. */
export const MATRIX_PAPER = '#F4F2EC';

/** The ink a check falls back to when a unit's own colour would vanish on the paper. */
export const CHECK_FALLBACK_INK = 'var(--shf-graphite-700)';

/** Below this WCAG ratio a glyph-sized mark is not reliably seen; 3:1 is the large-text floor. */
const MIN_CONTRAST = 3;

/**
 * The colour to draw a unit's check in on the matrix paper: the unit's own
 * colour when it can be seen there, dark ink when it cannot. TF WHITE is
 * `#E0E0E0`, which on `#F4F2EC` is a 1.2:1 ratio, so its checks were invisible
 * while every darker unit's read fine. Anything that is not a #RRGGBB colour
 * (a CSS variable, an empty string) is returned as given, because the maths
 * cannot judge it and the caller's default already covers blank.
 */
export function checkInk(color: string, paper: string = MATRIX_PAPER): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return contrastRatio(color, paper) < MIN_CONTRAST ? CHECK_FALLBACK_INK : color;
}
