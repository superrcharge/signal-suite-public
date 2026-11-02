/// <reference types="node" />
// Scoped to this file, as in eot.test.ts: the identity and font checks at the
// foot read the repo's real faces and hash the bytes written.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildPptxDeck, buildPptxSlide, pptxDeckParts, pptxParts, pptxSlideParts, type PptxObject, type PptxSlide, type PptxTextBox } from './pptx';
import { buildPptx } from './pptx';
import { packageProblems } from './pptx-package-checks';
import { OPERATION_DECK_FONTS, PPTX_EMBEDDED_FONTS, type FetchedFontFamily } from './sheet-fonts';
import { CATALOG_SLIDE, PACE_SLIDE, WIDE_SLIDE, emu } from './slide-geometry';
import { crc32, zipStore } from './zip-store';

const PACE_SHEET = { width: 1056, height: 816 };
const CATALOG_SHEET = { width: 816, height: 1056 };

/** A real 1x1 PNG, so the picture part carries bytes a parser will accept. */
const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A part's data is a string for XML and bytes for media. */
const asString = (data: string | Uint8Array | undefined) =>
  typeof data === 'string' ? data : new TextDecoder().decode(data);

describe('crc32', () => {
  // The check value every CRC-32/ISO-HDLC implementation agrees on. Without a
  // known-answer test this is a checksum that is merely self-consistent.
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore', () => {
  it('writes the local header, central directory and EOCD signatures', () => {
    const zip = zipStore([{ name: 'a.txt', data: 'hello' }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // EOCD is the last 22 bytes when there is no archive comment.
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(1);
  });

  it('stores rather than deflates, so the body appears verbatim', () => {
    const zip = zipStore([{ name: 'a.txt', data: 'hello' }]);
    expect(text(zip)).toContain('hello');
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint16(8, true)).toBe(0); // method 0 = STORE
  });

  it('is deterministic, because the timestamp is fixed rather than now', () => {
    const once = zipStore([{ name: 'a.txt', data: 'hello' }]);
    const twice = zipStore([{ name: 'a.txt', data: 'hello' }]);
    expect(Array.from(once)).toEqual(Array.from(twice));
  });

  it('round-trips every entry name in order', () => {
    const zip = zipStore([
      { name: 'one.xml', data: '<a/>' },
      { name: 'nested/two.xml', data: '<b/>' },
    ]);
    const body = text(zip);
    expect(body.indexOf('one.xml')).toBeLessThan(body.indexOf('nested/two.xml'));
  });
});

describe('pptxParts', () => {
  const parts = pptxParts({ slide: PACE_SLIDE, png: PNG_1X1, sheet: PACE_SHEET });
  const byName = new Map(parts.map((p) => [p.name, p.data]));

  // The property and metadata parts carry nothing this export cares about and
  // are required anyway: a package without them is refused. Keep this list in
  // step with pptxParts, and see the file comment for what is still unresolved.
  it('writes every part a presentation package needs', () => {
    expect(parts.map((p) => p.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/theme/theme1.xml',
      'ppt/presProps.xml',
      'ppt/viewProps.xml',
      'ppt/tableStyles.xml',
      'docProps/core.xml',
      'docProps/app.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/slides/slide1.xml',
      'ppt/slides/_rels/slide1.xml.rels',
      'ppt/media/image1.png',
    ]);
  });

  it('sets the slide size in EMU, landscape for PACE', () => {
    expect(byName.get('ppt/presentation.xml')).toContain(
      `<p:sldSz cx="${emu(11)}" cy="${emu(8.5)}"/>`,
    );
  });

  it('sets the slide size portrait for the catalog', () => {
    const portrait = pptxParts({
      slide: CATALOG_SLIDE,
      png: PNG_1X1,
      sheet: { width: 816, height: 1056 },
    });
    const presentation = portrait.find((p) => p.name === 'ppt/presentation.xml')?.data as string;
    expect(presentation).toContain(`<p:sldSz cx="${emu(8.5)}" cy="${emu(11)}"/>`);
  });

  it('places the picture full bleed at the origin', () => {
    const slide = byName.get('ppt/slides/slide1.xml') as string;
    expect(slide).toContain('<a:off x="0" y="0"/>');
    expect(slide).toContain(`<a:ext cx="${emu(11)}" cy="${emu(8.5)}"/>`);
  });

  it('carries the PNG bytes untouched', () => {
    expect(byName.get('ppt/media/image1.png')).toBe(PNG_1X1);
  });

  it('escapes alt text, which is the only caller-supplied string in the XML', () => {
    const escaped = pptxParts({
      slide: PACE_SLIDE,
      png: PNG_1X1,
      sheet: PACE_SHEET,
      altText: 'A SQD "wheel" & <card>',
    });
    const slide = escaped.find((p) => p.name === 'ppt/slides/slide1.xml')?.data as string;
    expect(slide).toContain('descr="A SQD &quot;wheel&quot; &amp; &lt;card&gt;"');
    expect(slide).not.toContain('<card>');
  });

  // Every part must be declared in [Content_Types].xml or PowerPoint refuses the
  // package. The two Default extensions cover the .rels and .png parts.
  it('declares an Override for every XML part that is not a relationship', () => {
    const types = byName.get('[Content_Types].xml') as string;
    for (const name of ['/ppt/presentation.xml', '/ppt/slideMasters/slideMaster1.xml',
      '/ppt/slideLayouts/slideLayout1.xml', '/ppt/slides/slide1.xml', '/ppt/theme/theme1.xml']) {
      expect(types).toContain(`PartName="${name}"`);
    }
    expect(types).toContain('Extension="rels"');
    expect(types).toContain('Extension="png"');
  });

  it('balances every spTree it opens', () => {
    for (const part of parts) {
      if (typeof part.data !== 'string') continue;
      const open = (part.data.match(/<p:spTree>/g) ?? []).length;
      const close = (part.data.match(/<\/p:spTree>/g) ?? []).length;
      expect({ part: part.name, open, close }).toEqual({ part: part.name, open, close: open });
    }
  });
});

/**
 * The two checks that would have caught the two defects that kept this
 * writer's output from opening, and which nothing here was doing.
 *
 * Every other assertion in this file is a substring or an array comparison, so
 * both defects were invisible: a malformed `p:otherStyle` still contains the
 * substrings the tests look for, and a missing relationship is an absence,
 * which no `toContain` can see. Note in particular that 'balances every spTree
 * it opens' above counts one tag pair and is structurally blind to an
 * unbalanced tag anywhere else in the part.
 */
describe('package validity', () => {
  const cases = [
    { label: 'PACE landscape', slide: PACE_SLIDE, sheet: PACE_SHEET },
    { label: 'catalog portrait', slide: CATALOG_SLIDE, sheet: CATALOG_SHEET },
  ];

  describe.each(cases)('$label', ({ slide, sheet }) => {
    const parts = pptxParts({ slide, png: PNG_1X1, sheet });

    it('emits well-formed XML for every string part', () => {
      const parser = new DOMParser();
      const broken: { part: string; error: string }[] = [];

      for (const part of parts) {
        if (typeof part.data !== 'string') continue;
        const doc = parser.parseFromString(part.data, 'application/xml');
        const failure = doc.getElementsByTagName('parsererror')[0];
        if (failure) broken.push({ part: part.name, error: failure.textContent ?? 'unknown' });
      }

      expect(broken).toEqual([]);
    });

    it('closes the relationship graph, so no part is orphaned', () => {
      const parser = new DOMParser();
      const names = new Set(parts.map((p) => p.name));

      const relsFor = (part: string) => {
        const slash = part.lastIndexOf('/');
        const dir = slash === -1 ? '' : part.slice(0, slash + 1);
        return `${dir}_rels/${part.slice(slash + 1)}.rels`;
      };

      // A relationship Target is resolved against the part's own directory,
      // '..' included, which is why this cannot be a string comparison.
      const resolve = (fromPart: string, target: string) => {
        const segments = fromPart.split('/').slice(0, -1);
        for (const segment of target.split('/')) {
          if (segment === '..') segments.pop();
          else if (segment !== '.') segments.push(segment);
        }
        return segments.join('/');
      };

      const unresolved: string[] = [];
      const relTypes = new Map<string, string[]>();

      for (const part of parts) {
        const relsName = relsFor(part.name);
        const rels = parts.find((p) => p.name === relsName);
        if (!rels || typeof rels.data !== 'string') continue;

        const doc = parser.parseFromString(rels.data, 'application/xml');
        const ids = new Set<string>();
        const types: string[] = [];

        for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
          const id = rel.getAttribute('Id') ?? '';
          const target = rel.getAttribute('Target') ?? '';
          ids.add(id);
          types.push((rel.getAttribute('Type') ?? '').split('/').pop() ?? '');

          const resolved = resolve(part.name, target);
          if (!names.has(resolved)) unresolved.push(`${relsName} ${id} -> ${resolved}`);
        }

        relTypes.set(part.name, types);

        // Every r:id and r:embed the part itself references must be declared.
        if (typeof part.data !== 'string') continue;
        for (const match of part.data.matchAll(/r:(?:id|embed)="([^"]+)"/g)) {
          const referenced = match[1];
          if (referenced && !ids.has(referenced)) {
            unresolved.push(`${part.name} references ${referenced}, undeclared`);
          }
        }
      }

      expect(unresolved).toEqual([]);

      // The specific absence that made every package refuse to open: a slide
      // part is required to carry exactly one slideLayout relationship, and
      // this one carried none.
      expect(relTypes.get('ppt/slides/slide1.xml')).toContain('slideLayout');
      expect(
        relTypes.get('ppt/slides/slide1.xml')?.filter((type) => type === 'slideLayout'),
      ).toHaveLength(1);
    });

    it('reaches every part from the package root', () => {
      const parser = new DOMParser();
      const byName = new Map(parts.map((p) => [p.name, p.data]));

      const relsFor = (part: string) => {
        const slash = part.lastIndexOf('/');
        const dir = slash === -1 ? '' : part.slice(0, slash + 1);
        return `${dir}_rels/${part.slice(slash + 1)}.rels`;
      };
      const resolve = (fromPart: string, target: string) => {
        const segments = fromPart.split('/').slice(0, -1);
        for (const segment of target.split('/')) {
          if (segment === '..') segments.pop();
          else if (segment !== '.') segments.push(segment);
        }
        return segments.join('/');
      };

      const seen = new Set<string>();
      const walk = (relsName: string, base: string) => {
        const data = byName.get(relsName);
        if (typeof data !== 'string') return;
        const doc = parser.parseFromString(data, 'application/xml');
        for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
          const resolved = resolve(base, rel.getAttribute('Target') ?? '');
          if (seen.has(resolved)) continue;
          seen.add(resolved);
          walk(relsFor(resolved), resolved);
        }
      };
      walk('_rels/.rels', 'root');

      const orphans = parts
        .map((p) => p.name)
        .filter((name) => !seen.has(name) && !name.includes('_rels/') && name !== '[Content_Types].xml');

      expect(orphans).toEqual([]);
    });
  });
});

describe('buildPptx', () => {
  it('produces a zip whose first bytes are the local header signature', () => {
    const out = buildPptx({ slide: PACE_SLIDE, png: PNG_1X1, sheet: PACE_SHEET });
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
    expect(out[2]).toBe(0x03);
    expect(out[3]).toBe(0x04);
  });

  it('is deterministic', () => {
    const a = buildPptx({ slide: PACE_SLIDE, png: PNG_1X1, sheet: PACE_SHEET });
    const b = buildPptx({ slide: PACE_SLIDE, png: PNG_1X1, sheet: PACE_SHEET });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});


describe('pptxSlideParts', () => {
  const TEXT: PptxTextBox = {
    place: { x: 1, y: 1, w: 2, h: 0.1875 },
    text: 'SEED NET 01',
    font: 'Barlow Condensed',
    sizePt: 10.125,
    bold: true,
    color: '0A0A0A',
    spc: 117,
    align: 'ctr',
    wrap: false,
  };

  it('writes one media part per picture, and numbers the rels to match', () => {
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [
        { png: PNG_1X1, place: { x: 0, y: 0, w: 5, h: 4 } },
        { png: PNG_1X1, place: { x: 5, y: 0, w: 5, h: 4 } },
      ],
    });
    const names = parts.map((p) => p.name);

    expect(names).toContain('ppt/media/image1.png');
    expect(names).toContain('ppt/media/image2.png');

    const rels = asString(parts.find((p) => p.name === 'ppt/slides/_rels/slide1.xml.rels')?.data);
    expect(rels).toContain('Id="rId1"');
    expect(rels).toContain('Id="rId2"');
    // The layout takes the id after the last image rather than a fixed rId2,
    // which is what stops a second picture from renumbering it away.
    expect(rels).toContain('Id="rId3"');
    expect(rels).toContain('/slideLayout');
  });

  it('emits a text box as an editable shape, not a picture', () => {
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [TEXT],
    });
    const slide = asString(parts.find((p) => p.name === 'ppt/slides/slide1.xml')?.data);

    expect(slide).toContain('<a:t>SEED NET 01</a:t>');
    expect(slide).toContain('txBox="1"');
    expect(slide).toContain('sz="1013"');
    expect(slide).toContain('spc="117"');
    expect(slide).toContain('<a:latin typeface="Barlow Condensed"/>');
    expect(slide).toContain('<a:srgbClr val="0A0A0A"/>');
    expect(slide).toContain('algn="ctr"');
    // Zeroed insets and no autofit are what make the measured rect the text's
    // rect: PowerPoint otherwise applies a 0.05in side inset to every box.
    expect(slide).toContain('lIns="0" tIns="0" rIns="0" bIns="0"');
    expect(slide).toContain('<a:noAutofit/>');
    // This fixture is centred, so its `wrap: false` is deliberately overridden.
    // See 'does not let a centred box go non-wrapping' below for why.
    expect(slide).toContain('wrap="square"');
  });

  /**
   * A consumer may shrink a `wrap="none"` shape to its single line. For
   * left-aligned text that changes nothing, because the string still starts at
   * the measured x. For centred text it re-centres the string in a narrower box
   * and slides it sideways, so the measured width has to be kept.
   */
  it('does not let a centred box go non-wrapping', () => {
    const slide = (box: PptxTextBox) =>
      asString(
        pptxSlideParts({
          slide: PACE_SLIDE,
          pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
          texts: [box],
        }).find((p) => p.name === 'ppt/slides/slide1.xml')?.data,
      );

    expect(slide({ ...TEXT, align: 'l', wrap: false })).toContain('wrap="none"');
    expect(slide({ ...TEXT, align: 'ctr', wrap: false })).toContain('wrap="square"');
    expect(slide({ ...TEXT, align: 'r', wrap: false })).toContain('wrap="square"');
  });

  it('gives every shape on the slide a distinct id', () => {
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [TEXT, { ...TEXT, text: 'SEED NET 02' }],
    });
    const slide = asString(parts.find((p) => p.name === 'ppt/slides/slide1.xml')?.data);

    const ids = Array.from(slide.matchAll(/<p:cNvPr id="(\d+)"/g)).map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // The spTree's own group shape holds id 1, so every picture and text box
    // has to start above it. One group, one picture, two text boxes.
    expect(ids).toEqual(['1', '2', '3', '4']);
  });

  it('escapes text, which is the one place a record reaches the XML', () => {
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [{ ...TEXT, text: 'R&D <net> "one"' }],
    });
    const slide = asString(parts.find((p) => p.name === 'ppt/slides/slide1.xml')?.data);

    expect(slide).toContain('R&amp;D &lt;net&gt;');
    expect(slide).not.toContain('<net>');
  });

  it('produces a package whose every part is still well-formed', () => {
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [TEXT, { ...TEXT, text: 'R&D <net>' }],
      background: 'F4F2EC',
    });
    const parser = new DOMParser();
    const broken = parts
      .filter((p) => typeof p.data === 'string')
      .map((p) => ({
        part: p.name,
        error: parser
          .parseFromString(p.data as string, 'application/xml')
          .getElementsByTagName('parsererror')[0]?.textContent,
      }))
      .filter((r) => r.error);

    expect(broken).toEqual([]);
  });

  it('is deterministic', () => {
    const input = {
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [TEXT],
    };
    expect(buildPptxSlide(input)).toEqual(buildPptxSlide(input));
  });

  describe('embedded fonts', () => {
    // A minimal but real sfnt: TrueType version and a zero-length table
    // directory. It has to parse now that the writer wraps each face in EOT,
    // which reads the font's own head, OS/2 and name tables.
    const FACE = (() => {
      const bytes = new Uint8Array(12);
      new DataView(bytes.buffer).setUint32(0, 0x00010000);
      return bytes;
    })();
    const parts = pptxSlideParts({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [TEXT],
      fonts: [
        { typeface: 'Barlow Condensed', regular: FACE, bold: FACE },
        { typeface: 'Oswald', regular: FACE, bold: FACE },
      ],
    });
    const names = parts.map((p) => p.name);

    /**
     * One part per (face, family) pair, not one per slot and not one per face.
     *
     * Within a family, the same file in both slots is one part - the real
     * shape, since Oswald ships only as a variable file and fills both slots
     * with it. Across families it cannot be, because the EOT header carries
     * the family name, so one header cannot serve two typefaces. Deduping on
     * the bytes alone collapsed these two fixtures into a single part whose
     * header named only one of them.
     */
    it('writes one part per face and family, not one per slot', () => {
      expect(names.filter((n) => n.startsWith('ppt/fonts/'))).toEqual([
        'ppt/fonts/font1.fntdata',
        'ppt/fonts/font2.fntdata',
      ]);
    });

    it('collapses both slots of one family to a single part', () => {
      const single = pptxSlideParts({
        slide: PACE_SLIDE,
        pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
        fonts: [{ typeface: 'Oswald', regular: FACE, bold: FACE }],
      });
      expect(single.map((p) => p.name).filter((n) => n.startsWith('ppt/fonts/'))).toEqual([
        'ppt/fonts/font1.fntdata',
      ]);
      expect(asString(single.find((p) => p.name === 'ppt/presentation.xml')?.data)).toContain(
        '<p:regular r:id="rIdF1"/><p:bold r:id="rIdF1"/>',
      );
    });

    it('writes a part per face when the faces differ', () => {
      const other = (() => {
        const bytes = new Uint8Array(16);
        new DataView(bytes.buffer).setUint32(0, 0x00010000);
        return bytes;
      })();
      const distinct = pptxSlideParts({
        slide: PACE_SLIDE,
        pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
        fonts: [{ typeface: 'Barlow Condensed', regular: FACE, bold: other }],
      });
      expect(distinct.map((p) => p.name).filter((n) => n.startsWith('ppt/fonts/'))).toEqual([
        'ppt/fonts/font1.fntdata',
        'ppt/fonts/font2.fntdata',
      ]);
    });

    it('declares the content type by extension, and relates every part', () => {
      expect(asString(parts.find((p) => p.name === '[Content_Types].xml')?.data)).toContain(
        '<Default Extension="fntdata" ContentType="application/x-fontdata"/>',
      );
      const rels = asString(parts.find((p) => p.name === 'ppt/_rels/presentation.xml.rels')?.data);
      expect(rels).toContain('Id="rIdF1"');
      expect(rels).toContain('Target="fonts/font1.fntdata"');
    });

    // CT_Presentation fixes the child order, and a consumer is entitled to
    // reject the part outright if embeddedFontLst is in the wrong place.
    it('puts embeddedFontLst after notesSz', () => {
      const presentation = asString(parts.find((p) => p.name === 'ppt/presentation.xml')?.data);
      expect(presentation).toContain('<p:embeddedFontLst>');
      expect(presentation.indexOf('<p:notesSz')).toBeLessThan(
        presentation.indexOf('<p:embeddedFontLst>'),
      );
      // Family 1's two slots share one part; family 2 gets its own.
      expect(presentation).toContain('<p:regular r:id="rIdF1"/><p:bold r:id="rIdF1"/>');
      expect(presentation).toContain('<p:regular r:id="rIdF2"/><p:bold r:id="rIdF2"/>');
    });

    it('emits nothing at all when no fonts are passed', () => {
      const bare = pptxSlideParts({
        slide: PACE_SLIDE,
        pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      });
      expect(bare.map((p) => p.name).some((n) => n.startsWith('ppt/fonts/'))).toBe(false);
      expect(asString(bare.find((p) => p.name === 'ppt/presentation.xml')?.data)).not.toContain(
        'embeddedFontLst',
      );
    });
  });
});

describe('buildPptxDeck', () => {
  const PNG_B = (() => {
    // Distinct bytes per slide, so a media part pointing at the wrong picture is visible.
    const bytes = Uint8Array.from(PNG_1X1);
    bytes[bytes.length - 5] = 0x42;
    return bytes;
  })();
  const FULL = { x: 0, y: 0, w: 13.333, h: 7.5 };
  const slideOf = (png: Uint8Array, pictures = 1): PptxSlide => ({
    slide: { w: 13.333, h: 7.5 },
    pictures: Array.from({ length: pictures }, () => ({ png, place: FULL, altText: 'x' })),
    background: '16181A',
  });
  const deck = [slideOf(PNG_1X1), slideOf(PNG_B), slideOf(PNG_1X1, 2), slideOf(PNG_B)];
  const parts = pptxDeckParts(deck);
  const byName = new Map(parts.map((p) => [p.name, p.data]));
  const parser = new DOMParser();

  const relsFor = (part: string) => {
    const slash = part.lastIndexOf('/');
    const dir = slash === -1 ? '' : part.slice(0, slash + 1);
    return `${dir}_rels/${part.slice(slash + 1)}.rels`;
  };
  const resolve = (fromPart: string, target: string) => {
    const segments = fromPart.split('/').slice(0, -1);
    for (const segment of target.split('/')) {
      if (segment === '..') segments.pop();
      else if (segment !== '.') segments.push(segment);
    }
    return segments.join('/');
  };

  it('writes one slide part, rels part and sldId per slide', () => {
    const names = parts.map((p) => p.name);
    for (let n = 1; n <= deck.length; n++) {
      expect(names).toContain(`ppt/slides/slide${n}.xml`);
      expect(names).toContain(`ppt/slides/_rels/slide${n}.xml.rels`);
    }
    const presentation = asString(byName.get('ppt/presentation.xml'));
    expect(presentation.match(/<p:sldId /g)).toHaveLength(deck.length);
    expect(asString(byName.get('docProps/app.xml'))).toContain(`<Slides>${deck.length}</Slides>`);
  });

  it('declares a content-type Override for every slide', () => {
    const types = asString(byName.get('[Content_Types].xml'));
    for (let n = 1; n <= deck.length; n++) expect(types).toContain(`PartName="/ppt/slides/slide${n}.xml"`);
  });

  it('emits well-formed XML for every string part', () => {
    const broken = parts
      .filter((p) => typeof p.data === 'string')
      .map((p) => ({ part: p.name, doc: parser.parseFromString(p.data as string, 'application/xml') }))
      .filter((r) => r.doc.getElementsByTagName('parsererror').length > 0)
      .map((r) => r.part);
    expect(broken).toEqual([]);
  });

  it('gives every slide id and relationship id exactly once, in slide order', () => {
    const presentation = parser.parseFromString(asString(byName.get('ppt/presentation.xml')), 'application/xml');
    const ids = Array.from(presentation.getElementsByTagName('p:sldId')).map((e) => e.getAttribute('id'));
    expect(ids).toEqual(['256', '257', '258', '259']);
    const rels = parser.parseFromString(asString(byName.get('ppt/_rels/presentation.xml.rels')), 'application/xml');
    const relIds = Array.from(rels.getElementsByTagName('Relationship')).map((e) => e.getAttribute('Id'));
    expect(new Set(relIds).size).toBe(relIds.length);
    // The slide list reads the slides in order through the rels.
    const targets = new Map(
      Array.from(rels.getElementsByTagName('Relationship')).map((e) => [e.getAttribute('Id'), e.getAttribute('Target')]),
    );
    const listed = Array.from(presentation.getElementsByTagName('p:sldId')).map((e) => targets.get(e.getAttribute('r:id')));
    expect(listed).toEqual(['slides/slide1.xml', 'slides/slide2.xml', 'slides/slide3.xml', 'slides/slide4.xml']);
  });

  it('closes the relationship graph: every Target exists and every r:id is declared', () => {
    const names = new Set(parts.map((p) => p.name));
    const unresolved: string[] = [];
    for (const part of parts) {
      const rels = byName.get(relsFor(part.name));
      if (typeof rels !== 'string') continue;
      const doc = parser.parseFromString(rels, 'application/xml');
      const declared = new Set<string>();
      for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
        declared.add(rel.getAttribute('Id') ?? '');
        const resolved = resolve(part.name, rel.getAttribute('Target') ?? '');
        if (!names.has(resolved)) unresolved.push(`${part.name} -> ${resolved}`);
      }
      if (typeof part.data === 'string') {
        for (const m of part.data.matchAll(/r:(?:id|embed)="([^"]+)"/g)) {
          if (m[1] && !declared.has(m[1])) unresolved.push(`${part.name} references ${m[1]}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('reaches every slide, layout and media part from the package root', () => {
    const seen = new Set<string>();
    const walk = (relsName: string, base: string) => {
      const data = byName.get(relsName);
      if (typeof data !== 'string') return;
      const doc = parser.parseFromString(data, 'application/xml');
      for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
        const resolved = resolve(base, rel.getAttribute('Target') ?? '');
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        walk(relsFor(resolved), resolved);
      }
    };
    walk('_rels/.rels', 'root');
    const orphans = parts
      .map((p) => p.name)
      .filter((n) => !seen.has(n) && !n.includes('_rels/') && n !== '[Content_Types].xml');
    expect(orphans).toEqual([]);
  });

  it('numbers media across the deck so no two slides share a part, and each points at its own picture', () => {
    const media = parts.filter((p) => p.name.startsWith('ppt/media/')).map((p) => p.name);
    expect(media).toEqual(['ppt/media/image1.png', 'ppt/media/image2.png', 'ppt/media/image3.png', 'ppt/media/image4.png', 'ppt/media/image5.png']);
    // Slide 3 has two pictures: its rels carry rId1, rId2 and the layout as rId3.
    const rels3 = asString(byName.get('ppt/slides/_rels/slide3.xml.rels'));
    expect(rels3).toContain('Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image3.png"');
    expect(rels3).toContain('Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image4.png"');
    expect(rels3).toContain('Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"');
    // Slide 2's one picture is the second PNG, and slide 4's is image5.
    expect(byName.get('ppt/media/image2.png')).toBe(PNG_B);
    expect(asString(byName.get('ppt/slides/_rels/slide4.xml.rels'))).toContain('Target="../media/image5.png"');
  });

  it('is byte-identical to buildPptxSlide for one slide, so the single-slide path did not move', () => {
    const one = slideOf(PNG_1X1);
    expect(Array.from(buildPptxDeck([one]))).toEqual(Array.from(buildPptxSlide(one)));
    expect(pptxDeckParts([one]).map((p) => p.name)).toEqual(pptxSlideParts(one).map((p) => p.name));
  });

  it('refuses an empty deck, mixed sizes and embedded fonts rather than writing a wrong package', () => {
    expect(() => pptxDeckParts([])).toThrow();
    expect(() => pptxDeckParts([slideOf(PNG_1X1), { ...slideOf(PNG_1X1), slide: PACE_SLIDE }])).toThrow(/same size/);
    const face = new Uint8Array(12);
    expect(() => pptxDeckParts([{ ...slideOf(PNG_1X1), fonts: [{ typeface: 'X', regular: face, bold: face }] }])).toThrow(/fonts/);
  });

  it('is deterministic', () => {
    expect(Array.from(buildPptxDeck(deck))).toEqual(Array.from(buildPptxDeck(deck)));
  });
});

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const realFace = (name: string) => new Uint8Array(readFileSync(join(FONT_DIR, name)));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The writers that existed before native objects, pinned by what they write.
 *
 * Shapes, connectors, groups and a deck's fonts were added beside them, so the
 * single picture, the PACE slide with its text and embedded fonts, and a deck of
 * pictures must come out as they did: these are the SHA-256 of the bytes each
 * produced before the change. A hash that moves means an existing export did,
 * and the font one also moves if a face in `public/fonts` is replaced, which is
 * worth knowing about in its own right.
 */
describe('the writers that predate native objects', () => {
  it('write the bytes they always did', () => {
    const oswald = realFace('Oswald-VariableFont_wght.ttf');
    const single = buildPptx({ slide: PACE_SLIDE, png: PNG_1X1, sheet: PACE_SHEET });
    const withFonts = buildPptxSlide({
      slide: PACE_SLIDE,
      pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 11, h: 8.5 } }],
      texts: [{ place: { x: 1, y: 1, w: 2, h: 0.5 }, text: 'Hi & <you>', font: 'Oswald', sizePt: 12, bold: true, color: '112233', spc: 20, align: 'ctr', anchor: 'ctr' }],
      fonts: [
        { typeface: 'Oswald', regular: oswald, bold: oswald },
        { typeface: 'Barlow Condensed', regular: realFace('BarlowCondensed-Regular.ttf'), bold: realFace('BarlowCondensed-Bold.ttf') },
      ],
      background: 'F4F2EC',
    });
    const deck = buildPptxDeck([
      { slide: WIDE_SLIDE, pictures: [{ png: PNG_1X1, place: { x: 0, y: 0, w: 5, h: 3 } }], background: 'F4F2EC' },
      { slide: WIDE_SLIDE, pictures: [{ png: PNG_1X1, place: { x: 1, y: 1, w: 5, h: 3 } }, { png: PNG_1X1, place: { x: 2, y: 1, w: 1, h: 1 } }] },
    ]);
    expect({ single: sha256(single), withFonts: sha256(withFonts), deck: sha256(deck) }).toEqual({
      single: 'b3e2786b0d9dd81d1412d42adeebdab338c5d2e56496f4da08cfdb0941c21674',
      withFonts: '0a63e1cea770b8e777a07eb2140e5e26f2f9503068f951b6728902f2a1563459',
      deck: '7c125f8232282f919d11a46d3cded37f1618e7b5b0fcd919c9f6f27faffca420',
    });
  });

  it('write a text box of one run exactly as before, and a second run only when asked', () => {
    const box: PptxTextBox = { place: { x: 1, y: 1, w: 2, h: 0.5 }, text: 'A', font: 'Oswald', sizePt: 12, color: '112233' };
    const one = asString(pptxSlideParts({ slide: PACE_SLIDE, pictures: [], texts: [box] }).find((p) => p.name === 'ppt/slides/slide1.xml')?.data);
    const two = asString(pptxSlideParts({ slide: PACE_SLIDE, pictures: [], texts: [{ ...box, runs: [{ text: 'B', font: 'IBM Plex Mono', sizePt: 9, bold: true, color: 'AABBCC' }] }] }).find((p) => p.name === 'ppt/slides/slide1.xml')?.data);
    expect(one.match(/<a:r>/g)).toHaveLength(1);
    expect(two.match(/<a:r>/g)).toHaveLength(2);
    expect(two).toContain('<a:t>A</a:t></a:r><a:r><a:rPr lang="en-US" sz="900" b="1" dirty="0"><a:solidFill><a:srgbClr val="AABBCC"/>');
    // Both runs are one paragraph.
    expect(two.match(/<a:p>/g)).toHaveLength(1);
  });
});

describe('native objects on a slide', () => {
  const stroke = { color: 'D9D4C5', widthPt: 0.75 };
  const run = { text: 'ALPHA', font: 'Oswald', sizePt: 10.5, bold: true, color: '0A0A0A' };
  const card = (key: string, x: number, y: number): PptxObject => ({
    kind: 'group',
    name: `Unit ${key}`,
    children: [
      { kind: 'shape', geom: 'rect', key, name: `Card ${key}`, place: { x, y, w: 2, h: 1 }, fill: 'FFFFFF', stroke },
      { kind: 'shape', geom: 'ellipse', place: { x: x + 0.1, y: y + 0.15, w: 0.1, h: 0.1 }, fill: '2E7D32' },
      { kind: 'text', box: { place: { x: x + 0.3, y: y + 0.1, w: 1.2, h: 0.2 }, wrap: false, ...run } },
    ],
  });
  const objects: PptxObject[] = [
    {
      kind: 'shape', geom: 'rect', name: 'Location ISB', place: { x: 0.5, y: 0.5, w: 7, h: 3 }, fill: 'EEECE6', stroke: { ...stroke, dash: true },
      text: { ...run, text: 'ISB', anchor: 't', wrap: false, inset: { l: 0.25, t: 0.09, r: 0.25, b: 0 } },
    },
    {
      kind: 'connector', name: 'A to B', descr: 'A and B share ANW2', points: [[3, 1.5], [4, 1.5], [4, 2.5], [5, 2.5]],
      start: { key: 'card:a', site: 3 }, end: { key: 'card:b', site: 1 }, stroke: { color: '3FB950', widthPt: 1.9 },
    },
    card('card:a', 1, 1),
    card('card:b', 5, 2),
    { kind: 'shape', geom: 'roundRect', radius: 0.5, name: 'Label', place: { x: 3.6, y: 1.9, w: 0.5, h: 0.2 }, fill: 'F4F2EC', stroke, text: { ...run, text: '1', align: 'ctr' } },
  ];
  const native = (slides = 4): PptxSlide[] => Array.from({ length: slides }, () => ({ slide: WIDE_SLIDE, pictures: [], objects, background: 'F4F2EC' }));
  // One array per file, as `sheetFontFiles` hands them over, so a family naming one file twice is one part.
  const loaded = new Map<string, Uint8Array>();
  const load = (url: string) => {
    const name = url.replace('/fonts/', '');
    if (!loaded.has(name)) loaded.set(name, realFace(name));
    return loaded.get(name)!;
  };
  const FONTS: FetchedFontFamily[] = OPERATION_DECK_FONTS.map((family) => ({
    typeface: family.typeface,
    regular: load(family.regular),
    bold: load(family.bold),
  }));
  const parts = pptxDeckParts(native(), { fonts: FONTS });
  const slideXml = (n: number) => asString(parts.find((p) => p.name === `ppt/slides/slide${String(n)}.xml`)?.data);
  const parser = new DOMParser();

  it('writes a four-slide native deck that passes every check: every part parses, the graph closes, ids are unique and every connector is attached to a shape on its slide', () => {
    expect(packageProblems(parts)).toEqual([]);
    expect(parts.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p.name))).toHaveLength(4);
  });

  it('gives each slide its own ids, once each, groups included', () => {
    for (let n = 1; n <= 4; n++) {
      const ids = Array.from(parser.parseFromString(slideXml(n), 'application/xml').getElementsByTagName('p:cNvPr')).map((e) => e.getAttribute('id'));
      expect(new Set(ids).size).toBe(ids.length);
      // The spTree's own group is 1, then the objects in order: 5 top level and 8 inside the two groups.
      expect(ids).toHaveLength(1 + 5 + 6);
    }
  });

  it('attaches a connector to the shapes it was keyed to, at the sites it was given, though the shapes come later in the stacking order', () => {
    const doc = parser.parseFromString(slideXml(1), 'application/xml');
    const byId = new Map(Array.from(doc.getElementsByTagName('p:cNvPr')).map((e) => [e.getAttribute('id'), e.getAttribute('name')]));
    const start = doc.getElementsByTagName('a:stCxn')[0]!;
    const end = doc.getElementsByTagName('a:endCxn')[0]!;
    expect(byId.get(start.getAttribute('id'))).toBe('Card card:a');
    expect(byId.get(end.getAttribute('id'))).toBe('Card card:b');
    expect(start.getAttribute('idx')).toBe('3');
    expect(end.getAttribute('idx')).toBe('1');
    expect(Number(end.getAttribute('id'))).toBeGreaterThan(Number(start.getAttribute('id')));
    // And the connector is drawn before either card, so under both.
    expect(slideXml(1).indexOf('<p:cxnSp>')).toBeLessThan(slideXml(1).indexOf('name="Unit card:a"'));
  });

  it('writes a connector in its own box with the elbow the route needs, and no glue on a plain line', () => {
    const x = slideXml(1);
    expect(x).toContain('<a:prstGeom prst="bentConnector3"><a:avLst><a:gd name="adj1" fmla="val 50000"/></a:avLst></a:prstGeom>');
    expect(x).toContain(`<a:off x="${String(emu(3))}" y="${String(emu(1.5))}"/><a:ext cx="${String(emu(2))}" cy="${String(emu(1))}"/>`);
    const plain = asString(pptxSlideParts({
      slide: PACE_SLIDE, pictures: [],
      objects: [{ kind: 'connector', points: [[1, 1], [2, 1]], stroke: { color: 'FF0000', widthPt: 1, dash: true } }],
    }).find((p) => p.name === 'ppt/slides/slide1.xml')?.data);
    expect(plain).not.toContain('stCxn');
    expect(plain).toContain('<a:prstDash val="dash"/>');
    expect(plain).toContain('prst="straightConnector1"');
  });

  it('frames a group as the union of its children, in the slide\'s own coordinates', () => {
    const x = slideXml(1);
    const left = emu(1);
    const top = emu(1);
    expect(x).toContain(`<p:grpSpPr><a:xfrm><a:off x="${String(left)}" y="${String(top)}"/><a:ext cx="${String(emu(2))}" cy="${String(emu(1))}"/><a:chOff x="${String(left)}" y="${String(top)}"/><a:chExt cx="${String(emu(2))}" cy="${String(emu(1))}"/></a:xfrm></p:grpSpPr>`);
  });

  it('carries a shape\'s own text inside it, with its insets, so the text moves with the shape', () => {
    const x = slideXml(1);
    expect(x).toContain(`<a:bodyPr wrap="none" lIns="${String(emu(0.25))}" tIns="${String(emu(0.09))}" rIns="${String(emu(0.25))}" bIns="0" anchor="t">`);
    expect(x).toContain('<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>');
    expect(x).toContain('<a:ln><a:noFill/></a:ln>');
    expect(x).toContain('<a:prstDash val="dash"/>');
  });

  it('refuses a connector attached to a shape that is not on the slide, and two shapes with one key', () => {
    const one = (o: PptxObject[]): PptxSlide => ({ slide: WIDE_SLIDE, pictures: [], objects: o });
    expect(() => pptxDeckParts([one([{ kind: 'connector', points: [[0, 0], [1, 1]], start: { key: 'nowhere', site: 0 }, stroke }])])).toThrow(/nowhere/);
    const shape: PptxObject = { kind: 'shape', geom: 'rect', key: 'k', place: { x: 0, y: 0, w: 1, h: 1 } };
    expect(() => pptxDeckParts([one([shape, shape])])).toThrow(/keyed "k"/);
  });

  describe('the fonts of a native deck', () => {
    const fonts = parts.filter((p) => p.name.startsWith('ppt/fonts/'));

    it('are embedded once for the deck, not once per slide', () => {
      // Oswald's one variable file fills both its slots; Plex Mono has a Regular and a SemiBold: three parts for four slides.
      expect(fonts.map((p) => p.name)).toEqual(['ppt/fonts/font1.fntdata', 'ppt/fonts/font2.fntdata', 'ppt/fonts/font3.fntdata']);
      const presentation = asString(parts.find((p) => p.name === 'ppt/presentation.xml')?.data);
      expect(presentation.match(/<p:embeddedFont>/g)).toHaveLength(OPERATION_DECK_FONTS.length);
      expect(presentation).toContain('typeface="IBM Plex Mono"');
      expect(presentation.indexOf('<p:notesSz')).toBeLessThan(presentation.indexOf('<p:embeddedFontLst>'));
    });

    it('are EOT, not raw sfnt: each part carries the EOT header\'s magic and is as long as it says', () => {
      for (const part of fonts) {
        const bytes = part.data as Uint8Array;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(view.getUint16(34, true)).toBe(0x504c);
        expect(view.getUint32(0, true)).toBe(bytes.length);
        expect(String.fromCharCode(...bytes.subarray(0, 4))).not.toBe('\u0000\u0001\u0000\u0000');
      }
    });

    it('name every typeface the objects use, and every face the deck embeds exists on disk', () => {
      expect(OPERATION_DECK_FONTS.map((f) => f.typeface)).toEqual(['Oswald', 'IBM Plex Mono']);
      for (const family of OPERATION_DECK_FONTS) {
        expect(realFace(family.regular.replace('/fonts/', '')).length).toBeGreaterThan(1000);
        expect(realFace(family.bold.replace('/fonts/', '')).length).toBeGreaterThan(1000);
      }
      // The PACE list is untouched by the deck's.
      expect(PPTX_EMBEDDED_FONTS.map((f) => f.typeface)).toEqual(['Barlow Condensed', 'Oswald']);
    });

    it('are refused on a slide of their own, and absent from a deck that passes none', () => {
      expect(() => pptxDeckParts([{ ...native(1)[0]!, fonts: FONTS }])).toThrow(/once/);
      const bare = pptxDeckParts(native(2));
      expect(bare.some((p) => p.name.startsWith('ppt/fonts/'))).toBe(false);
      expect(asString(bare.find((p) => p.name === 'ppt/presentation.xml')?.data)).not.toContain('embeddedFontLst');
      expect(packageProblems(bare)).toEqual([]);
    });
  });

  // A check that has never failed has not been shown to work: each is run against the defect it exists for.
  it('is judged by checks that do fail on the defects they guard', () => {
    const swap = (name: string, data: string | Uint8Array) => parts.map((p) => (p.name === name ? { ...p, data } : p));
    expect(packageProblems(swap('ppt/fonts/font1.fntdata', FONTS[0]!.regular))).toEqual(
      expect.arrayContaining([expect.stringMatching(/font1.fntdata is not an EOT/), expect.stringMatching(/font1.fntdata begins as a raw sfnt/)]),
    );
    expect(packageProblems(swap('ppt/slides/slide2.xml', slideXml(2).replace('<a:stCxn id="5"', '<a:stCxn id="99"')))).toEqual(
      [expect.stringMatching(/slide2.xml has a connector attached to shape 99/)],
    );
    expect(packageProblems(swap('ppt/slides/slide3.xml', slideXml(3).replace('<p:cNvPr id="6"', '<p:cNvPr id="5"')))).toEqual(
      [expect.stringMatching(/slide3.xml uses shape id 5 twice/)],
    );
    expect(packageProblems(swap('ppt/slides/slide4.xml', `${slideXml(4)}<unclosed`))).toEqual([expect.stringMatching(/slide4.xml is not well-formed/)]);
    expect(packageProblems(parts.filter((p) => p.name !== 'ppt/theme/theme1.xml')).length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(Array.from(buildPptxDeck(native(), { fonts: FONTS }))).toEqual(Array.from(buildPptxDeck(native(), { fonts: FONTS })));
  });
});
