/**
 * The `@font-face` CSS embedded into a captured sheet, built narrow and cached.
 *
 * A serialized clone is rendered as a standalone document, so it cannot reach
 * the page's loaded fonts. Every face it needs has to arrive inline, as base64.
 *
 * `html-to-image` will do this itself by walking `document.styleSheets`, and
 * that is why it is not left to. `catalog-tokens.css` declares eleven self
 * hosted `.ttf` faces totalling 2.1 MB, which base64 inflates to roughly 2.9 MB
 * pasted into the SVG on every single click. Passing `fontEmbedCSS` skips its
 * parsing entirely and lets us send only what the sheets actually draw with.
 *
 * Sizes, measured from `frontend/public/fonts`:
 *
 *   Oswald variable                  169 KB   needed, --font-display
 *   Barlow Condensed 400/600/700     305 KB   needed, --font-condensed, the wheel
 *   Barlow Condensed 500/800         203 KB   omitted, no sheet weight uses them
 *   IBM Plex Sans roman              533 KB   needed, --font-body
 *   IBM Plex Sans italic             594 KB   omitted, neither sheet sets italic
 *   IBM Plex Mono 400/600            272 KB   needed, --font-mono
 *   IBM Plex Mono 500                135 KB   omitted
 *
 * The italic face alone is over a quarter of the total and no sheet sets
 * `font-style: italic` anywhere, which is what makes the narrow list worth
 * having rather than a micro-optimisation.
 *
 * A face that fails to fetch is omitted rather than fatal, and the caller is
 * told. That matters more than it looks: `WHEEL_SPREAD` in `SheetPreview` was
 * measured against condensed labels with under 2px of slack against the Paper's
 * `overflow: hidden`, so a non-condensed fallback does not merely restyle the
 * wheel, it pushes the outermost frequencies off the page. Degrading silently
 * would produce a slide that is subtly wrong with nothing to say why.
 */

export interface SheetFontFace {
  readonly family: string;
  /** Copied verbatim from catalog-tokens.css. A variable face carries a range. */
  readonly weight: string;
  readonly style: 'normal' | 'italic';
  readonly url: string;
}

/**
 * Confirm against the browser before trusting this list, by loading a sheet and
 * reading what the page actually downloaded:
 *
 *   Array.from(document.fonts)
 *     .filter(f => f.status === 'loaded')
 *     .map(f => `${f.family} ${f.weight} ${f.style}`)
 */
export const SHEET_FONT_FACES: readonly SheetFontFace[] = [
  { family: 'Oswald', weight: '100 900', style: 'normal', url: '/fonts/Oswald-VariableFont_wght.ttf' },
  { family: 'Barlow Condensed', weight: '400', style: 'normal', url: '/fonts/BarlowCondensed-Regular.ttf' },
  { family: 'Barlow Condensed', weight: '600', style: 'normal', url: '/fonts/BarlowCondensed-SemiBold.ttf' },
  { family: 'Barlow Condensed', weight: '700', style: 'normal', url: '/fonts/BarlowCondensed-Bold.ttf' },
  { family: 'IBM Plex Sans', weight: '100 700', style: 'normal', url: '/fonts/IBMPlexSans-VariableFont.ttf' },
  { family: 'IBM Plex Mono', weight: '400', style: 'normal', url: '/fonts/IBMPlexMono-Regular.ttf' },
  { family: 'IBM Plex Mono', weight: '600', style: 'normal', url: '/fonts/IBMPlexMono-SemiBold.ttf' },
];

export interface SheetFontCss {
  readonly css: string;
  /** Families that could not be fetched. Non-empty means the picture may clip. */
  readonly missing: readonly string[];
}

async function fetchAsBase64(url: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked rather than one spread: a 533 KB face is over half a million
  // arguments, which overflows the call stack in String.fromCharCode.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function faceCss(face: SheetFontFace, base64: string): string {
  return [
    '@font-face{',
    `font-family:"${face.family}";`,
    `src:url(data:font/ttf;base64,${base64}) format("truetype");`,
    `font-weight:${face.weight};`,
    `font-style:${face.style};`,
    'font-display:block;',
    '}',
  ].join('');
}

/**
 * Builds the embed CSS once per session.
 *
 * The promise is cached rather than the string, so two clicks in quick
 * succession share one build instead of racing two.
 */
let cached: Promise<SheetFontCss> | null = null;

export function sheetFontEmbedCss(fetcher: typeof fetch = fetch): Promise<SheetFontCss> {
  cached ??= build(fetcher);
  return cached;
}

/** Test seam. Nothing in the app calls this. */
export function resetSheetFontCache(): void {
  cached = null;
}

async function build(fetcher: typeof fetch): Promise<SheetFontCss> {
  const results = await Promise.allSettled(
    SHEET_FONT_FACES.map(async (face) => faceCss(face, await fetchAsBase64(face.url, fetcher))),
  );

  const parts: string[] = [];
  const missing: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      parts.push(result.value);
      return;
    }
    const family = SHEET_FONT_FACES[i]?.family;
    // One entry per family, not one per failed weight: three missing Barlow
    // weights are one problem to report, not three.
    if (family && !missing.includes(family)) missing.push(family);
  });

  return { css: parts.join(''), missing };
}

/**
 * The faces embedded INTO a .pptx, which is a different and smaller set than
 * the faces embedded into a captured picture above.
 *
 * Two reasons it is smaller. Only the PACE card emits native text, and its
 * text boxes name exactly two families - verified from a real export, which
 * declares `Barlow Condensed` and `Oswald` and nothing else. The catalog
 * datasheet's IBM Plex faces are already drawn into its PNG, so embedding them
 * would add about 785 KB that no shape on any slide references.
 *
 * The shape of the list is dictated by the format, not by preference.
 * `p:embeddedFont` is per FAMILY with four style slots - regular, bold, italic,
 * boldItalic - so a family cannot contribute more than one weight per slot.
 * Barlow Condensed ships Regular, SemiBold and Bold here and only two of them
 * have a home; `runStyle` calls anything at 600 or above bold, so w600 and w700
 * both resolve to the bold slot and SemiBold is deliberately not embedded.
 *
 * Every one of these files reports `fsType = 0`, unrestricted embedding, so
 * this is licence-clean. Measured with the OS/2 table, not assumed.
 *
 * Confirmed rendering in PowerPoint on Windows, 2026-09-09, on a machine
 * without these faces installed.
 *
 * The doubt is recorded because it was reasonable and will recur: Oswald here
 * is a VARIABLE font (it carries an `fvar` table), PowerPoint is known to
 * handle those poorly, and its EOT header reports weight 400 with the bold slot
 * pointing at the same file - so the w600 title was expected to render light. It
 * does not. Do not add a static Oswald SemiBold to `public/fonts` to "fix" it;
 * that was the planned remedy and it is not needed.
 *
 * Barlow Condensed is static across both embedded weights and carries every
 * table cell, so it was never the face at risk.
 */
export interface EmbeddedFontFamily {
  readonly typeface: string;
  readonly regular: string;
  readonly bold: string;
}

export const PPTX_EMBEDDED_FONTS: readonly EmbeddedFontFamily[] = [
  {
    typeface: 'Barlow Condensed',
    regular: '/fonts/BarlowCondensed-Regular.ttf',
    bold: '/fonts/BarlowCondensed-Bold.ttf',
  },
  {
    // The same variable file in both slots: there is no static Oswald in the
    // repo, and the title is the only Oswald run on the card.
    typeface: 'Oswald',
    regular: '/fonts/Oswald-VariableFont_wght.ttf',
    bold: '/fonts/Oswald-VariableFont_wght.ttf',
  },
];

export interface FetchedFontFamily {
  readonly typeface: string;
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
}

/** An sfnt begins with one of these. Checked so a 404's HTML never ships as a font. */
function isFontData(bytes: Uint8Array): boolean {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  return tag === '\u0000\u0001\u0000\u0000' || tag === 'true' || tag === 'OTTO' || tag === 'ttcf';
}

async function fetchFont(url: string, fetcher: typeof fetch): Promise<Uint8Array> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`fetch ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isFontData(bytes)) throw new Error(`${url} is not an sfnt`);
  return bytes;
}

/**
 * Fetches the embeddable faces, or returns an empty list.
 *
 * A family that cannot be fetched whole is dropped rather than half embedded,
 * and a total failure is not fatal: the slide still opens and its text falls
 * back to whatever the viewer has, which is exactly what happens with no
 * embedding at all.
 */
export async function sheetFontFiles(
  fetcher: typeof fetch = fetch,
): Promise<readonly FetchedFontFamily[]> {
  // One fetch per distinct URL, and the SAME array handed to both slots when a
  // family names one file twice. That reference identity is what lets the
  // writer collapse them to a single part instead of embedding 165 KB of
  // Oswald under two different names.
  const cache = new Map<string, Promise<Uint8Array>>();
  const load = (url: string) => {
    const existing = cache.get(url);
    if (existing) return existing;
    const pending = fetchFont(url, fetcher);
    cache.set(url, pending);
    return pending;
  };

  const results = await Promise.allSettled(
    PPTX_EMBEDDED_FONTS.map(async (family) => ({
      typeface: family.typeface,
      regular: await load(family.regular),
      bold: await load(family.bold),
    })),
  );

  return results
    .filter(
      (result): result is PromiseFulfilledResult<FetchedFontFamily> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value);
}
