import { describe, expect, it } from 'vitest';

import {
  CATALOG_SLIDE,
  DEFAULT_PIXEL_RATIO,
  EMU_PER_INCH,
  PACE_SLIDE,
  emu,
  pixelDimensions,
  slideImagePlacement,
} from './slide-geometry';

const PACE_SHEET = { width: 1056, height: 816 };
const CATALOG_SHEET = { width: 816, height: 1056 };

describe('slide sizes', () => {
  it('are US Letter, one each way up', () => {
    expect(PACE_SLIDE).toEqual({ w: 11, h: 8.5 });
    expect(CATALOG_SLIDE).toEqual({ w: 8.5, h: 11 });
  });

  // The sheets are laid out in CSS pixels at 96dpi. If that ever stops matching
  // the slide sizes above, the export silently letterboxes instead of bleeding.
  it('match their sheet at 96dpi', () => {
    expect(PACE_SHEET.width / 96).toBe(PACE_SLIDE.w);
    expect(PACE_SHEET.height / 96).toBe(PACE_SLIDE.h);
    expect(CATALOG_SHEET.width / 96).toBe(CATALOG_SLIDE.w);
    expect(CATALOG_SHEET.height / 96).toBe(CATALOG_SLIDE.h);
  });
});

describe('slideImagePlacement', () => {
  it('fills the slide when the aspects agree', () => {
    expect(slideImagePlacement(PACE_SLIDE, PACE_SHEET)).toEqual({ x: 0, y: 0, w: 11, h: 8.5 });
    expect(slideImagePlacement(CATALOG_SLIDE, CATALOG_SHEET)).toEqual({ x: 0, y: 0, w: 8.5, h: 11 });
  });

  it('tolerates sub-pixel rounding rather than letterboxing', () => {
    expect(slideImagePlacement(PACE_SLIDE, { width: 1056.4, height: 816 })).toEqual({
      x: 0, y: 0, w: 11, h: 8.5,
    });
  });

  it('fits and centres a sheet wider than the slide, rather than stretching it', () => {
    const place = slideImagePlacement(CATALOG_SLIDE, { width: 1000, height: 500 });
    expect(place.w).toBe(8.5);
    expect(place.h).toBe(4.25);
    expect(place.x).toBe(0);
    expect(place.y).toBeCloseTo((11 - 4.25) / 2, 10);
  });

  it('fits and centres a sheet taller than the slide', () => {
    const place = slideImagePlacement(PACE_SLIDE, { width: 500, height: 1000 });
    expect(place.h).toBe(8.5);
    expect(place.w).toBe(4.25);
    expect(place.y).toBe(0);
    expect(place.x).toBeCloseTo((11 - 4.25) / 2, 10);
  });
});

describe('pixelDimensions', () => {
  it('lands both sheets on 192 DPI at the default ratio', () => {
    expect(pixelDimensions(PACE_SHEET)).toEqual({ px: 2112, py: 1632, ratio: 2, dpi: 192 });
    expect(pixelDimensions(CATALOG_SHEET)).toEqual({ px: 1632, py: 2112, ratio: 2, dpi: 192 });
  });

  it('defaults to 2 rather than the device pixel ratio', () => {
    expect(DEFAULT_PIXEL_RATIO).toBe(2);
    expect(pixelDimensions(PACE_SHEET).ratio).toBe(DEFAULT_PIXEL_RATIO);
  });

  it('clamps a ratio the browser would refuse to allocate', () => {
    expect(pixelDimensions(PACE_SHEET, 99).ratio).toBe(4);
    expect(pixelDimensions(PACE_SHEET, 0.1).ratio).toBe(1);
  });
});

describe('emu', () => {
  it('converts inches to whole EMU', () => {
    expect(emu(1)).toBe(EMU_PER_INCH);
    expect(emu(11)).toBe(10058400);
    expect(emu(8.5)).toBe(7772400);
    expect(Number.isInteger(emu(4.3333))).toBe(true);
  });
});
