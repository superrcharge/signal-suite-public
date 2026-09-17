/**
 * Perceptual color math, used by the co-occurrence constraint tests.
 *
 * Nothing here runs in the app at runtime - it exists so that "these two colors
 * are far enough apart" is a measurement rather than an opinion in a comment.
 */

type Rgb = [number, number, number];

/** Split `#rrggbb` into three 0-1 channels. */
function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return (
    '#' +
    rgb
      .map((v) => {
        const n = Math.round(Math.min(1, Math.max(0, v)) * 255);
        return n.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

/** Undo the sRGB transfer function so channel math happens in linear light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * sRGB hex to OKLab (Bjorn Ottosson, 2020). OKLab is close to perceptually
 * uniform, so plain Euclidean distance in it tracks "how different do these
 * look" far better than distance in RGB or HSL.
 */
export function oklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Perceptual distance between two hex colors. Larger is more distinguishable. */
export function deltaOk(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export type Vision = 'normal' | 'deuteranopia' | 'protanopia' | 'tritanopia';

/**
 * Dichromacy approximations. These model full dichromacy, which is more severe
 * than the anomalous trichromacy most affected people actually have, so they
 * are a conservative guardrail rather than a proof of accessibility.
 */
const CVD_MATRICES: Record<Exclude<Vision, 'normal'>, number[][]> = {
  deuteranopia: [[0.625, 0.375, 0], [0.700, 0.300, 0], [0, 0.300, 0.700]],
  protanopia:   [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  tritanopia:   [[0.950, 0.050, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
};

/** Render a hex color as someone with the given color vision would see it. */
export function simulate(hex: string, vision: Vision): string {
  if (vision === 'normal') return hex;
  const rgb = hexToRgb(hex);
  const matrix = CVD_MATRICES[vision];
  return rgbToHex(
    matrix.map((row) => row[0]! * rgb[0] + row[1]! * rgb[1] + row[2]! * rgb[2]) as Rgb,
  );
}

/** Distance between two colors as seen under a given vision type. */
export function deltaOkUnder(a: string, b: string, vision: Vision): number {
  return deltaOk(simulate(a, vision), simulate(b, vision));
}

/** Every unordered pair from a list, for exhaustive cross-checks. */
export function pairs<T>(items: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      out.push([items[i]!, items[j]!]);
    }
  }
  return out;
}
