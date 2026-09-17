import { describe, expect, it } from 'vitest';

import { buildPptxSlide, pptxParts, pptxSlideParts, type PptxTextBox } from './pptx';
import { buildPptx } from './pptx';
import { CATALOG_SLIDE, PACE_SLIDE, emu } from './slide-geometry';
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
