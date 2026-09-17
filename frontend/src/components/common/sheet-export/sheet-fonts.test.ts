import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHEET_FONT_FACES, resetSheetFontCache, sheetFontEmbedCss } from './sheet-fonts';

function fakeFetch(failFor: string[] = []) {
  return vi.fn((input: RequestInfo | URL) => {
    // Narrowed rather than String()d: a Request has no useful default
    // stringification, and the lint is right to say so.
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (failFor.some((f) => url.includes(f))) {
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer),
    } as unknown as Response);
  });
}

afterEach(() => {
  resetSheetFontCache();
  vi.restoreAllMocks();
});

describe('SHEET_FONT_FACES', () => {
  it('omits the italic face, which no sheet sets and which is the largest file', () => {
    expect(SHEET_FONT_FACES.some((f) => f.style === 'italic')).toBe(false);
  });

  it('keeps variable weight ranges verbatim rather than collapsing them', () => {
    // Collapsing "100 900" to "400" silently changes which instance the browser
    // picks for every other weight on the sheet.
    expect(SHEET_FONT_FACES.find((f) => f.family === 'Oswald')?.weight).toBe('100 900');
    expect(SHEET_FONT_FACES.find((f) => f.family === 'IBM Plex Sans')?.weight).toBe('100 700');
  });

  it('carries the condensed weights the wheel draws with', () => {
    const condensed = SHEET_FONT_FACES.filter((f) => f.family === 'Barlow Condensed');
    expect(condensed.map((f) => f.weight).sort()).toEqual(['400', '600', '700']);
  });

  it('points every face at a self-hosted ttf', () => {
    for (const face of SHEET_FONT_FACES) {
      expect(face.url).toMatch(/^\/fonts\/.+\.ttf$/);
    }
  });
});

describe('sheetFontEmbedCss', () => {
  it('emits one @font-face per face, as an inline data URI', async () => {
    const { css, missing } = await sheetFontEmbedCss(fakeFetch());

    expect(missing).toEqual([]);
    expect((css.match(/@font-face\{/g) ?? []).length).toBe(SHEET_FONT_FACES.length);
    expect(css).toContain('src:url(data:font/ttf;base64,AAECAw==) format("truetype")');
    expect(css).toContain('font-family:"Barlow Condensed"');
    expect(css).toContain('font-weight:100 900');
  });

  // font-display:block, not swap. A swap would let the capture race a fallback
  // face onto the canvas and there is no second chance to repaint it.
  it('blocks rather than swaps, because a capture cannot repaint later', async () => {
    const { css } = await sheetFontEmbedCss(fakeFetch());
    expect(css).toContain('font-display:block');
    expect(css).not.toContain('font-display:swap');
  });

  it('omits a face that fails to fetch and names its family, without throwing', async () => {
    const { css, missing } = await sheetFontEmbedCss(fakeFetch(['BarlowCondensed-Bold']));

    expect(missing).toEqual(['Barlow Condensed']);
    expect((css.match(/@font-face\{/g) ?? []).length).toBe(SHEET_FONT_FACES.length - 1);
    // The surviving faces are still usable; a partial embed beats no picture.
    expect(css).toContain('font-family:"Oswald"');
  });

  it('reports each missing family once, not once per failed weight', async () => {
    const { missing } = await sheetFontEmbedCss(fakeFetch(['BarlowCondensed']));
    expect(missing).toEqual(['Barlow Condensed']);
  });

  it('builds once and caches, so a double click does not fetch twice', async () => {
    const fetcher = fakeFetch();
    const [a, b] = await Promise.all([sheetFontEmbedCss(fetcher), sheetFontEmbedCss(fetcher)]);

    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(SHEET_FONT_FACES.length);
  });
});
