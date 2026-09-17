/**
 * Colour for the comparison matrix, as two named schemes rather than
 * hardcoded values in the renderer.
 *
 * The matrix has always been drawn on dark graphite, which is right on
 * screen and right for the digital exports (.png, clipboard, .pptx) that
 * capture the screen as it stands. It is wrong on paper: a browser drops
 * background colours when printing unless the user opts into "background
 * graphics", so a page printed against the dark scheme comes out as light
 * text on a white sheet with the backgrounds simply gone, which is close to
 * unreadable. There is no single palette that is correct in both places, so
 * there are two: DARK is what the screen and every non-paper export use,
 * and INK is what the print route uses, built to hold up with no background
 * at all, dark text straight onto white paper.
 *
 * INK is not DARK with the colours swapped. Amber reads as an accent on
 * graphite and is never used as text there either, but on white paper it is
 * flatly the wrong choice for text regardless: #F5A21F on #FFFFFF measures
 * 2.1:1, nowhere near readable, so the group heading gets its own darkened
 * amber-adjacent colour for INK rather than reusing `accent` as text. Ink on
 * paper also has to survive a laser printer, an inkjet, and a photocopier
 * run in greyscale, which is why INK's zebra stripe is a visible-but-quiet
 * 7% grey rather than the near-invisible tint that would be normal on
 * screen: a laser fuser does not render a 2% tint at all.
 *
 * Both schemes draw the not-applicable and blank cells with the same
 * intent CompareMatrix.tsx already documents: `na` and `faint` differ from
 * each other by the glyph they draw (`n/a` versus the datasheet's blank
 * marker), not by contrast. Making the blank cell noticeably fainter than a
 * real value, in both schemes, is what keeps the two kinds of empty told
 * apart from a filled-in one; it is not a licence to drop it below legible.
 *
 * Every value here is exposed as a CSS custom property through
 * `paletteVars`, so the renderer switches schemes by swapping which object
 * populates the properties, never by branching per colour at every call
 * site.
 */
export interface ComparePalette {
  /** Row ground, even rows. */
  bg: string;
  /** Zebra, odd rows. */
  bgAlt: string;
  /** Header row ground. */
  head: string;
  /** Header text ("Parameter", equipment names). */
  headText: string;
  /** Group heading band. */
  group: string;
  /** Group heading label. */
  groupText: string;
  /** Hairline between rows. */
  rule: string;
  /** Under the header, beside the label column, and the outer edge. */
  ruleStrong: string;
  /** The 2px top rule only. Never used as text. */
  accent: string;
  /** Values. */
  fg: string;
  /** Row labels. */
  label: string;
  /** The lowercase n/a glyph. */
  na: string;
  /** The blank glyph and unit suffixes. */
  faint: string;
  /** List-value chip ground. */
  chipBg: string;
  /** List-value chip text. */
  chipFg: string;
  /** List-value chip border. */
  chipBorder: string;
  /** Photo well ground. */
  photoBg: string;
  /** Photo well border. */
  photoBorder: string;
  /** The "NO PHOTO" placeholder text. */
  photoText: string;
  /** Ground behind the red "Page edge" tag, on screen only. */
  guideTagBg: string;
}

/**
 * Today's screen colours, resolved from catalog-tokens.css and pinned here
 * as literal hex rather than `var(--shf-...)`. Two reasons for the literals:
 * `contrastRatio` needs a real colour to compute against, and the export
 * rasterizer (the .png/clipboard/.pptx path) captures whatever is actually
 * painted, so a custom property that resolved differently at capture time
 * than on screen would be a silent, hard-to-notice regression. This is the
 * palette every non-print surface uses, and it must never drift from the
 * shipped screen, which is what the "pins today's values" test below is for.
 */
export const DARK: ComparePalette = {
  bg: '#141618',
  bgAlt: '#1C1F22',
  head: '#1C1F22',
  headText: '#9AA0A8',
  group: '#25292D',
  groupText: '#F5A21F',
  rule: '#25292D',
  ruleStrong: '#2F343A',
  accent: '#F5A21F',
  fg: '#F4F2EC',
  label: '#9AA0A8',
  na: '#9AA0A8',
  faint: '#6B7178',
  chipBg: '#25292D',
  chipFg: '#F4F2EC',
  chipBorder: '#2F343A',
  photoBg: '#0A0A0A',
  photoBorder: '#25292D',
  photoText: '#444A52',
  guideTagBg: '#141618',
};

/**
 * The print scheme: dark ink on white paper, built to stay legible with no
 * background colour rendered at all, which is the default a browser prints
 * with. `groupText` is a darkened amber-adjacent brown rather than the
 * screen's amber, because amber on white measures 2.1:1 and is not usable
 * as text; it still reads as warm accent colour and prints as a dark grey
 * on a monochrome run. `bgAlt` is a visible 7% grey rather than a near-white
 * tint, because a laser printer's fuser does not reproduce a faint tint the
 * way a screen renders one.
 */
export const INK: ComparePalette = {
  bg: '#FFFFFF',
  bgAlt: '#EDEDED',
  head: '#FFFFFF',
  headText: '#111111',
  group: '#E4E4E4',
  groupText: '#6E4508',
  rule: '#C4C4C4',
  ruleStrong: '#111111',
  accent: '#F5A21F',
  fg: '#111111',
  label: '#2A2D31',
  na: '#4A4F55',
  faint: '#5A5F66',
  chipBg: '#FFFFFF',
  chipFg: '#111111',
  chipBorder: '#9AA0A8',
  photoBg: '#FFFFFF',
  photoBorder: '#C4C4C4',
  photoText: '#5A5F66',
  guideTagBg: '#FFFFFF',
};

export type PaletteKey = keyof ComparePalette;

/** camelCase to kebab-case, so `bgAlt` becomes `bg-alt` and `guideTagBg`
 *  becomes `guide-tag-bg`. Shared by paletteVars and cmp so a key can only
 *  ever produce one property name. */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * A palette object as CSS custom properties, ready to spread onto a style
 * object: `{ '--cmp-bg': '#141618', '--cmp-bg-alt': '#1C1F22', ... }`.
 *
 * This is the mechanism that lets the matrix switch between DARK and INK by
 * setting the palette in one place, an ancestor's style, rather than
 * threading a scheme flag through every inline style: CompareMatrix sets
 * DARK, and the print route sets whichever scheme `?ink` names around
 * CompareSheet.
 */
export function paletteVars(p: ComparePalette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of Object.keys(p) as PaletteKey[]) {
    vars[`--cmp-${kebab(key)}`] = p[key];
  }
  return vars;
}

/**
 * The `var(...)` reference for one semantic colour, e.g. `cmp('bgAlt')` is
 * `'var(--cmp-bg-alt)'`. Call sites read the semantic name, never the raw
 * property string, so a renamed custom property only has to change here.
 */
export function cmp(key: PaletteKey): string {
  return `var(--cmp-${kebab(key)})`;
}

/** sRGB channel (0-255) to linear light, the WCAG 2.x gamma correction. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a #RRGGBB hex colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.x contrast ratio between two #RRGGBB hex colours, from 1 (no
 * contrast) to 21 (black on white). Order of the arguments does not matter:
 * the ratio is defined from the lighter of the two to the darker.
 *
 * This is what the tests below check every foreground/background pairing
 * against, so a future colour edit is caught by the number it actually
 * produces rather than by eye.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
