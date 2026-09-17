/// <reference types="node" />
// Scoped to this file rather than added to tsconfig: it is the only test that
// reads the repo's real font files, and widening the app's types for one
// fixture would change what every other file sees.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readFontNames, ttfToEot } from './eot';
import { PPTX_EMBEDDED_FONTS } from './sheet-fonts';

/**
 * Asserted against the repo's real faces rather than a synthetic font.
 *
 * A hand-built fixture would only prove this code agrees with itself, and the
 * fields that matter - PANOSE, weight, fsType, the Unicode ranges, the name
 * records - are exactly the ones a fixture would get to invent.
 */
const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const face = (name: string) => new Uint8Array(readFileSync(join(FONT_DIR, name)));

const BARLOW_REGULAR = face('BarlowCondensed-Regular.ttf');
const BARLOW_BOLD = face('BarlowCondensed-Bold.ttf');
const OSWALD = face('Oswald-VariableFont_wght.ttf');

const le = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Reads the four size-prefixed UTF-16LE names back out of the header.
 *
 * Starts at 80, matching the writer: `Padding1` at that offset is the first
 * name's own padding short, so `FamilyNameSize` is at 82.
 */
function readHeaderNames(eot: Uint8Array): string[] {
  const view = le(eot);
  const names: string[] = [];
  let at = 80;
  for (let i = 0; i < 4; i += 1) {
    const size = view.getUint16(at + 2, true);
    let text = '';
    for (let j = 0; j < size; j += 2) {
      text += String.fromCharCode(view.getUint16(at + 4 + j, true));
    }
    names.push(text);
    at += 4 + size;
  }
  return names;
}

describe('ttfToEot', () => {
  const eot = ttfToEot(BARLOW_REGULAR, 'Barlow Condensed');
  const view = le(eot);

  it('writes the magic number, so a consumer can detect corruption', () => {
    expect(view.getUint16(34, true)).toBe(0x504c);
  });

  it('declares version 0x00020001, the layout ttf2eot emits', () => {
    expect(view.getUint32(8, true)).toBe(0x00020001);
  });

  /**
   * The property the whole design rests on. Flags = 0 means no subsetting, no
   * MicroType Express compression and no XOR, which is what makes the payload
   * the untouched font file - and therefore what makes this a header to
   * prepend rather than a font to transform.
   */
  it('sets Flags to 0 and leaves the font data byte-identical', () => {
    expect(view.getUint32(12, true)).toBe(0);
    expect(eot.subarray(eot.length - BARLOW_REGULAR.length)).toEqual(BARLOW_REGULAR);
  });

  it('sizes both length fields to match what it actually wrote', () => {
    expect(view.getUint32(0, true)).toBe(eot.length); // EOTSize
    expect(view.getUint32(4, true)).toBe(BARLOW_REGULAR.length); // FontDataSize
    // The header is everything before the payload.
    expect(eot.length - BARLOW_REGULAR.length).toBeGreaterThan(82);
  });

  /**
   * FamilyName comes from the declared typeface, not the font's name table,
   * because it has to agree with the `typeface` in p:embeddedFontLst - that is
   * the string the runs name and the consumer matches on.
   */
  it('takes FamilyName from the declared typeface', () => {
    expect(readHeaderNames(eot)[0]).toBe('Barlow Condensed');
    expect(readHeaderNames(ttfToEot(BARLOW_REGULAR, 'Something Else'))[0]).toBe('Something Else');
  });

  it('carries the style, version and full name off the font itself', () => {
    const [, style, version, full] = readHeaderNames(eot);
    const names = readFontNames(BARLOW_REGULAR);
    expect(style).toBe(names.style);
    expect(version).toBe(names.version);
    expect(full).toBe(names.full);
    expect(names.style.length).toBeGreaterThan(0);
  });

  it('reads the weight out of OS/2 rather than guessing it', () => {
    expect(le(ttfToEot(BARLOW_REGULAR, 'Barlow Condensed')).getUint32(28, true)).toBe(400);
    expect(le(ttfToEot(BARLOW_BOLD, 'Barlow Condensed')).getUint32(28, true)).toBe(700);
  });

  it('reports these faces as upright and unrestricted', () => {
    expect(view.getUint8(27)).toBe(0); // Italic
    expect(view.getUint16(32, true)).toBe(0); // fsType 0: installable
  });

  it('copies the 10 PANOSE bytes', () => {
    // Non-zero somewhere, or the classification was silently dropped.
    expect(Array.from(eot.subarray(16, 26)).some((b) => b !== 0)).toBe(true);
  });

  /**
   * The offsets, pinned. This is where the one real bug in this file lived: the
   * name block starts at 80, because `Padding1` at that offset is the first
   * name's own padding short, and `FamilyNameSize` therefore sits at 82.
   * Starting the block at 82 emits one padding too many and shifts every name
   * field by two bytes, leaving a consumer to read 0 for the family name size
   * and misparse the rest.
   *
   * Nothing in this file would have caught that alone, and the package stayed
   * valid with it. It was found by diffing against `ttf2eot`, an independent
   * implementation of the same spec, which came out two bytes shorter for the
   * same face. With this fixed the two agree byte for byte across all 97,352
   * bytes, which is the closest thing to external validation available without
   * PowerPoint on Windows.
   */
  it('puts Padding1 at 80 and FamilyNameSize at 82', () => {
    expect(view.getUint16(80, true)).toBe(0);
    // 'Barlow Condensed' is 16 UTF-16 code units, so 32 bytes.
    expect(view.getUint16(82, true)).toBe(32);
    expect(
      new TextDecoder('utf-16le').decode(eot.subarray(84, 84 + 32)),
    ).toBe('Barlow Condensed');
  });

  it('sizes the header as 80 plus the four names plus RootStringSize', () => {
    const names = readFontNames(BARLOW_REGULAR);
    const expected =
      80 +
      ['Barlow Condensed', names.style, names.version, names.full].reduce(
        (total, name) => total + 4 + name.length * 2,
        0,
      ) +
      4;
    expect(eot.length - BARLOW_REGULAR.length).toBe(expected);
  });

  it('is deterministic', () => {
    expect(ttfToEot(BARLOW_REGULAR, 'Barlow Condensed')).toEqual(
      ttfToEot(BARLOW_REGULAR, 'Barlow Condensed'),
    );
  });

  it('handles a variable font, which is what Oswald ships as here', () => {
    const oswald = ttfToEot(OSWALD, 'Oswald');
    expect(le(oswald).getUint16(34, true)).toBe(0x504c);
    expect(oswald.subarray(oswald.length - OSWALD.length)).toEqual(OSWALD);
    expect(readHeaderNames(oswald)[0]).toBe('Oswald');
  });

  /**
   * The failure this really guards. A 404 from the dev server returns an HTML
   * page, and shipping that as a font would produce a package that still
   * validates and still opens with the fonts silently missing - the exact
   * failure mode this whole module exists to fix.
   */
  it('refuses anything that is not an sfnt', () => {
    const html = new TextEncoder().encode('<!doctype html><title>404</title>');
    expect(() => ttfToEot(html, 'Barlow Condensed')).toThrow(/not an sfnt/);
  });

  it('refuses a truncated font rather than reading out of bounds', () => {
    expect(() => ttfToEot(BARLOW_REGULAR.subarray(0, 8), 'Barlow Condensed')).toThrow(/truncated/);
    const lyingHeader = new Uint8Array(16);
    new DataView(lyingHeader.buffer).setUint32(0, 0x00010000);
    new DataView(lyingHeader.buffer).setUint16(4, 99); // claims 99 tables
    expect(() => ttfToEot(lyingHeader, 'X')).toThrow(/truncated/);
  });
});

describe('the faces this repo declares for embedding', () => {
  /**
   * The disagreement worth catching: the header's FamilyName is taken from the
   * declared typeface, so if a font file's own family name differs, the two
   * describe different things and nothing else would notice.
   */
  it('name their own family the same as the typeface declared for them', () => {
    for (const family of PPTX_EMBEDDED_FONTS) {
      for (const url of [family.regular, family.bold]) {
        const names = readFontNames(face(url.replace('/fonts/', '')));
        expect({ url, family: names.family }).toEqual({ url, family: family.typeface });
      }
    }
  });
});
