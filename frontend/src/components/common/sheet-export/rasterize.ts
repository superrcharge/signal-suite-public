/**
 * Turns one on-screen sheet into a canvas.
 *
 * THE ONLY FILE THAT IMPORTS `html-to-image`. Everything above it speaks in
 * terms of a `SheetExportSpec` and a canvas, so replacing the library is a
 * single-file change with the unit tests untouched. Swap it if a security
 * advisory lands against it, if a browser change breaks its SVG path, or if
 * this ever needs an off-main-thread capture: `modern-screenshot`'s
 * `domToCanvas` is the closest equivalent, with `font.cssText` in place of
 * `fontEmbedCSS` and `scale` in place of `pixelRatio`.
 *
 * Why this library. It clones the node and copies `getComputedStyle` per node,
 * which is what carries emotion's injected classes and resolves every
 * `var(--shf-*)` token into the clone. `html2canvas` reimplements CSS layout
 * instead of cloning, and both sheets lean on exactly what it is weakest at:
 * CSS grid with gaps, custom properties, and a large inline SVG using
 * `<symbol>`, `<use>` and `<clipPath>`.
 *
 * The import is dynamic so the library is fetched on first use rather than on
 * every page load.
 */
import { inlineBlobImages } from './inline-blob-images';
import { keepInSheet } from './sheet-root';
import { sheetFontEmbedCss } from './sheet-fonts';
import { DEFAULT_PIXEL_RATIO, pixelDimensions, type SheetSize } from './slide-geometry';
import { waitForSheetReady } from './wait-for-sheet';

/** Read once from the token, so a transparent PNG never lands on a dark deck. */
const PAPER_FALLBACK = '#F4F2EC';

/** 1x1 transparent PNG. See imagePlaceholder below. */
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export interface RasterizeSpec extends SheetSize {
  readonly root: HTMLElement;
  readonly pixelRatio?: number;
  readonly style?: Record<string, string>;
  readonly backgroundColor?: string;
}

export interface RasterizeResult {
  readonly canvas: HTMLCanvasElement;
  /** Families that could not be embedded. Non-empty means the text may be wider. */
  readonly missingFonts: readonly string[];
}

function paperColor(): string {
  if (typeof window === 'undefined') return PAPER_FALLBACK;
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--shf-paper')
    .trim();
  return token || PAPER_FALLBACK;
}

export async function rasterizeSheet(spec: RasterizeSpec): Promise<RasterizeResult> {
  const { toCanvas } = await import('html-to-image');
  const { ratio } = pixelDimensions(spec, spec.pixelRatio ?? DEFAULT_PIXEL_RATIO);

  await waitForSheetReady(spec.root);
  const fonts = await sheetFontEmbedCss();

  // Swapped in the live DOM, because the clone is not ours to reach into.
  const inlined = await inlineBlobImages(spec.root);
  try {
    const canvas = await toCanvas(spec.root, {
      width: spec.width,
      height: spec.height,
      pixelRatio: ratio,
      backgroundColor: spec.backgroundColor ?? paperColor(),
      fontEmbedCSS: fonts.css,
      // NEVER enable cacheBust. It appends a query string to every resource URL,
      // which makes a blob: URL unresolvable and blanks exactly the photos and
      // emblems inlineBlobImages exists to preserve.
      cacheBust: false,
      // The fallback when the library cannot fetch a resource. It defaults to
      // the empty string, and an <img src=""> in the serialized SVG fails the
      // whole outer image. inlineBlobImages already swaps broken images out;
      // this is the second line of defence for anything it did not see.
      imagePlaceholder: TRANSPARENT_PX,
      // Screen affordances marked with sheetOmitProps stay out of the clone.
      filter: keepInSheet,
      style: {
        // elevation={3} on the PACE Paper, and the catalog page box's own shadow,
        // are screen affordances that have no business on a slide.
        boxShadow: 'none',
        margin: '0',
        ...spec.style,
      },
    });
    return { canvas, missingFonts: fonts.missing };
  } finally {
    inlined.restore();
  }
}
