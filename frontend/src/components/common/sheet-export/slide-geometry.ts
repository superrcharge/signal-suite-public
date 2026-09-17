/**
 * Slide sizes and picture placement. Pure, so it is asserted directly rather
 * than through a rendered picture, which is the one thing jsdom cannot produce.
 */

/** English Metric Units, the unit PowerPoint stores every length in. */
export const EMU_PER_INCH = 914400;

/** A slide's size, in inches. */
export interface SlideSize {
  readonly w: number;
  readonly h: number;
}

/**
 * US Letter landscape. The PACE comms card is drawn at 1056 x 816 CSS px,
 * which is 11 x 8.5in at 96dpi, so the slide is the sheet at 1:1.
 */
export const PACE_SLIDE: SlideSize = { w: 11, h: 8.5 };

/** US Letter portrait. The catalog page box is 816 x 1056, the same the other way up. */
export const CATALOG_SLIDE: SlideSize = { w: 8.5, h: 11 };

/**
 * Output pixels per CSS pixel.
 *
 * Passed explicitly on every call. `html-to-image` otherwise defaults to
 * `window.devicePixelRatio`, which would make the same button produce a 96 DPI
 * slide on an ordinary monitor and a 192 DPI one on a Retina display, with
 * nothing on screen to say which you got.
 *
 * Both sheets are already laid out at 96dpi Letter, so 2 lands exactly on 192
 * DPI: 2112 x 1632 for PACE, 1632 x 2112 for the catalog.
 */
export const DEFAULT_PIXEL_RATIO = 2;

/** Clamped so a caller cannot ask for a canvas the browser refuses to allocate. */
const MIN_PIXEL_RATIO = 1;
const MAX_PIXEL_RATIO = 4;

export interface SheetSize {
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Where the picture sits on the slide, in inches.
 *
 * Both sheets match their slide's aspect exactly, so this is full bleed today.
 * The fitted branch exists for the case where that stops being true: a sheet
 * scaled to fill a slide of a different shape is stretched, and a stretched
 * comms card is worse than one with a margin.
 */
export function slideImagePlacement(slide: SlideSize, sheet: SheetSize): Placement {
  const slideAspect = slide.w / slide.h;
  const sheetAspect = sheet.width / sheet.height;

  // Within a thousandth is the same shape. Rounding in the caller's CSS pixels
  // should not tip a full-bleed sheet into the letterboxing branch.
  if (Math.abs(slideAspect - sheetAspect) < 0.001) {
    return { x: 0, y: 0, w: slide.w, h: slide.h };
  }

  if (sheetAspect > slideAspect) {
    // Wider than the slide: full width, bars above and below.
    const h = slide.w / sheetAspect;
    return { x: 0, y: (slide.h - h) / 2, w: slide.w, h };
  }

  // Taller than the slide: full height, bars left and right.
  const w = slide.h * sheetAspect;
  return { x: (slide.w - w) / 2, y: 0, w, h: slide.h };
}

/** The rasterized size, and the DPI it works out to on a Letter sheet. */
export function pixelDimensions(
  sheet: SheetSize,
  pixelRatio: number = DEFAULT_PIXEL_RATIO,
): { px: number; py: number; ratio: number; dpi: number } {
  const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, pixelRatio));
  return {
    px: Math.round(sheet.width * ratio),
    py: Math.round(sheet.height * ratio),
    ratio,
    // Both sheets are laid out at 96 CSS px per inch, so the ratio is the multiplier.
    dpi: 96 * ratio,
  };
}

/** Inches to EMU, rounded, which is what the OOXML writer needs. */
export function emu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}
