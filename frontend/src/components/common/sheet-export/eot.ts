/**
 * Wraps a TrueType face in the Embedded OpenType container PowerPoint reads.
 *
 * `ppt/fonts/*.fntdata` is EOT, not an sfnt. That is the whole reason this file
 * exists, and it is worth stating plainly because a raw TTF put there fails
 * SILENTLY in both directions: the package stays valid, every local check
 * passes, Keynote still opens the file, and the fonts are simply ignored. The
 * first version of this feature shipped exactly that mistake.
 *
 * The decisive evidence that EOT is required rather than merely conventional:
 * Apache POI had to implement a TTF-to-EOT conversion to make PPTX font
 * embedding work at all. A mature library finding raw TTF insufficient
 * outweighs any amount of prose.
 *
 * What makes this cheap is a single property of the format: with `Flags = 0`
 * there is no subsetting, no MicroType Express compression and no XOR
 * encryption, so `FontData` is the unmodified font file. This is a header to
 * prepend, not a font to transform - which is also why it is pure bytes in,
 * bytes out, and therefore properly testable, unlike the rasterize path.
 *
 * Layout and field order follow the W3C EOT submission. The version written is
 * `0x00020001`, whose header ends after `RootStringSize`, matching what
 * `ttf2eot` emits - the de facto interoperable minimal EOT that consumers have
 * accepted for years. `0x00020002` would add EUDC and signature fields that
 * carry nothing here.
 *
 * **Validated against `ttf2eot`, not just against itself.** For
 * `BarlowCondensed-Regular.ttf` this produces output byte for byte identical to
 * that reference implementation, all 97,352 bytes. That comparison is what
 * found the one real bug here, an extra padding short that shifted every name
 * field by two bytes, and it is the closest thing to external validation
 * available on a machine with no PowerPoint. The offsets it settled are pinned
 * in the test rather than the dependency being added to the repo.
 */

/** Header constants, per the spec. The magic exists to catch corruption. */
const EOT_VERSION = 0x00020001;
const EOT_MAGIC = 0x504c;
/** No subsetting, no MTX compression, no XOR. This is what keeps FontData raw. */
const EOT_FLAGS = 0;
/** DEFAULT_CHARSET, which is what ttf2eot writes rather than deriving one. */
const DEFAULT_CHARSET = 1;

interface SfntTable {
  readonly offset: number;
  readonly length: number;
}

/** The four names EOT carries, and the sfnt `name` IDs they come from. */
export interface FontNames {
  readonly family: string;
  readonly style: string;
  readonly version: string;
  readonly full: string;
}

function tableDirectory(font: DataView, bytes: Uint8Array): Map<string, SfntTable> {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  const versionTag = font.getUint32(0);
  // 0x00010000 is TrueType outlines, 'OTTO' is CFF, 'true' is an older Apple
  // flavour. A 404's HTML page matches none of them, which is the case this
  // guard is really for.
  if (versionTag !== 0x00010000 && tag !== 'OTTO' && tag !== 'true') {
    throw new Error(`not an sfnt: leading bytes ${tag}`);
  }

  if (bytes.length < 12) throw new Error(`sfnt truncated: ${bytes.length} bytes`);

  const numTables = font.getUint16(4);
  if (bytes.length < 12 + numTables * 16) {
    throw new Error(`sfnt table directory truncated: ${numTables} tables in ${bytes.length} bytes`);
  }

  const tables = new Map<string, SfntTable>();
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(...bytes.subarray(record, record + 4));
    tables.set(name, {
      offset: font.getUint32(record + 8),
      length: font.getUint32(record + 12),
    });
  }
  return tables;
}

/**
 * Reads the four names, preferring the Windows platform records.
 *
 * Platform 3 encoding 1 strings are UTF-16BE, so they are decoded rather than
 * copied - EOT wants UTF-16LE. Platform 1 is the Mac fallback and is single
 * byte. A name that is absent comes back empty, which is legal: the size field
 * simply says 0.
 */
export function readFontNames(bytes: Uint8Array): FontNames {
  const font = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = tableDirectory(font, bytes).get('name');
  if (!name) return { family: '', style: '', version: '', full: '' };

  const count = font.getUint16(name.offset + 2);
  const stringArea = name.offset + font.getUint16(name.offset + 4);

  // Windows records win; a Mac record is kept only if nothing better turned up.
  const best = new Map<number, { text: string; windows: boolean }>();
  for (let i = 0; i < count; i += 1) {
    const record = name.offset + 6 + i * 12;
    const platformId = font.getUint16(record);
    const nameId = font.getUint16(record + 6);
    const length = font.getUint16(record + 8);
    const offset = stringArea + font.getUint16(record + 10);
    const raw = bytes.subarray(offset, offset + length);

    let text: string;
    if (platformId === 3) {
      let out = '';
      for (let j = 0; j + 1 < raw.length; j += 2) {
        out += String.fromCharCode(((raw[j] ?? 0) << 8) | (raw[j + 1] ?? 0));
      }
      text = out;
    } else if (platformId === 1) {
      text = String.fromCharCode(...raw);
    } else {
      continue;
    }

    const existing = best.get(nameId);
    if (!existing || (platformId === 3 && !existing.windows)) {
      best.set(nameId, { text, windows: platformId === 3 });
    }
  }

  return {
    family: best.get(1)?.text ?? '',
    style: best.get(2)?.text ?? '',
    version: best.get(5)?.text ?? '',
    full: best.get(4)?.text ?? '',
  };
}

interface FontMetrics {
  readonly panose: Uint8Array;
  readonly italic: boolean;
  readonly weight: number;
  readonly fsType: number;
  readonly unicodeRange: readonly number[];
  readonly codePageRange: readonly number[];
  readonly checkSumAdjustment: number;
}

/**
 * Pulls the classification fields EOT repeats out of `OS/2` and `head`.
 *
 * Every one of them is duplicated information - the font already carries it -
 * but a consumer matching an embedded face to a run reads the header, not the
 * font, so a wrong value here is a face that never gets used.
 */
function readMetrics(bytes: Uint8Array): FontMetrics {
  const font = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = tableDirectory(font, bytes);

  const head = tables.get('head');
  const os2 = tables.get('OS/2');

  // OS/2 field offsets: panose at 32, ulUnicodeRange1 at 42, fsSelection at 62,
  // ulCodePageRange1 at 78 (version 1 and above).
  const panose = os2 ? bytes.slice(os2.offset + 32, os2.offset + 42) : new Uint8Array(10);
  const os2Version = os2 ? font.getUint16(os2.offset) : 0;
  const fsSelection = os2 ? font.getUint16(os2.offset + 62) : 0;
  const macStyle = head ? font.getUint16(head.offset + 44) : 0;

  return {
    panose: panose.length === 10 ? panose : new Uint8Array(10),
    // fsSelection bit 0 is ITALIC; macStyle bit 1 is the older signal.
    italic: (fsSelection & 0x01) !== 0 || (macStyle & 0x02) !== 0,
    weight: os2 ? font.getUint16(os2.offset + 4) : 400,
    fsType: os2 ? font.getUint16(os2.offset + 8) : 0,
    unicodeRange: os2
      ? [0, 1, 2, 3].map((i) => font.getUint32(os2.offset + 42 + i * 4))
      : [0, 0, 0, 0],
    // Only present from OS/2 version 1, and absent is legitimately 0.
    codePageRange:
      os2 && os2Version >= 1 && os2.length >= 86
        ? [0, 1].map((i) => font.getUint32(os2.offset + 78 + i * 4))
        : [0, 0],
    checkSumAdjustment: head ? font.getUint32(head.offset + 8) : 0,
  };
}

/** UTF-16LE bytes, which is how EOT stores all four names. */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = code >> 8;
  }
  return out;
}

/**
 * Builds the EOT for one face.
 *
 * `typeface` is the authority for `FamilyName`, not the font's own `name`
 * table, because the header has to agree with the `typeface` declared in
 * `p:embeddedFontLst` - that string is what the runs name, and a consumer
 * matches on it. Oswald here is a variable font whose name records describe an
 * instance rather than the weight the card actually uses, which is exactly the
 * kind of disagreement this avoids. `readFontNames` is exported so a test can
 * assert the two do agree for the faces this repo ships.
 */
export function ttfToEot(ttf: Uint8Array, typeface: string): Uint8Array {
  const metrics = readMetrics(ttf);
  const names = readFontNames(ttf);

  const familyName = utf16le(typeface);
  const styleName = utf16le(names.style);
  const versionName = utf16le(names.version);
  const fullName = utf16le(names.full);

  // 80 fixed bytes, then each name as a padding short, a size short and its
  // bytes, then RootStringSize. FontData follows the header.
  //
  // The name block starts at 80, NOT 82. `Padding1` at offset 80 is the padding
  // that belongs to the FIRST name, so `FamilyNameSize` sits at 82. Starting
  // the loop at 82 emits one padding short too many and shifts every name field
  // by two bytes, which leaves a consumer reading 0 for the family name size and
  // misparsing the whole block. Caught by diffing against ttf2eot, which is two
  // bytes shorter for the same face and is the reason that comparison is worth
  // keeping in the test.
  const headerSize =
    80 +
    (2 + 2 + familyName.length) +
    (2 + 2 + styleName.length) +
    (2 + 2 + versionName.length) +
    (2 + 2 + fullName.length) +
    (2 + 2);

  const out = new Uint8Array(headerSize + ttf.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, out.length, true); // EOTSize, the whole structure
  view.setUint32(4, ttf.length, true); // FontDataSize
  view.setUint32(8, EOT_VERSION, true);
  view.setUint32(12, EOT_FLAGS, true);
  out.set(metrics.panose, 16);
  view.setUint8(26, DEFAULT_CHARSET);
  view.setUint8(27, metrics.italic ? 0x01 : 0x00);
  view.setUint32(28, metrics.weight, true);
  view.setUint16(32, metrics.fsType, true);
  view.setUint16(34, EOT_MAGIC, true);
  metrics.unicodeRange.forEach((range, i) => view.setUint32(36 + i * 4, range, true));
  metrics.codePageRange.forEach((range, i) => view.setUint32(52 + i * 4, range, true));
  view.setUint32(60, metrics.checkSumAdjustment, true);
  // Reserved1-4 at 64..79 are left zero, as the spec requires. Padding1 at 80 is
  // written by the loop below, as the first name's own padding short.

  let at = 80;
  for (const name of [familyName, styleName, versionName, fullName]) {
    view.setUint16(at, 0, true); // PaddingN
    view.setUint16(at + 2, name.length, true); // NameSize, in BYTES
    out.set(name, at + 4);
    at += 4 + name.length;
  }

  view.setUint16(at, 0, true); // Padding5
  view.setUint16(at + 2, 0, true); // RootStringSize: no URL restriction
  at += 4;

  // The property the whole design rests on: with Flags = 0 the payload is the
  // font file, unmodified.
  out.set(ttf, at);
  return out;
}
