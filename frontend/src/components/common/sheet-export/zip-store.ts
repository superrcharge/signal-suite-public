/**
 * A minimal ZIP writer, STORE method, no dependency.
 *
 * This exists because the obvious library for writing a .pptx, `pptxgenjs`,
 * depends on `image-size`, which carries two HIGH advisories
 * (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq) whose patched version is NONE at
 * every release ever published. There is nothing to upgrade to and nothing to
 * override to, so `npm audit --audit-level=high` in `/ship` check 2b would have
 * failed on every push from that point on. The exposure was not real - the
 * library maps `"image-size": false` in its `browser` field, so those parsers
 * never enter the bundle - but a gate reads the dependency tree rather than the
 * bundle, and the alert would never have cleared on its own.
 *
 * STORE rather than DEFLATE, deliberately. The one large entry is a PNG, which
 * is already compressed and would not shrink; the rest is a few KB of XML.
 * Storing costs almost nothing here and removes the only part of a ZIP writer
 * that is hard to get right. Stored entries are fully spec-valid, and both
 * `unzip -t` and `python-pptx` read the result without complaint.
 *
 * Deliberately NOT supported, because none of it is reachable from one slide
 * carrying one picture: ZIP64, directory entries, encryption, and data
 * descriptors. An archive that needed any of them would be silently wrong, so
 * `zipStore` refuses rather than truncating - see the size guard below.
 */

/** One file in the archive. */
export interface ZipEntry {
  /** Forward-slash path, as it appears inside the package. */
  readonly name: string;
  readonly data: string | Uint8Array;
}

/** ZIP32 cannot address past 4GB. Nothing here approaches it; refusing is honest. */
const MAX_ZIP_BYTES = 0xffffffff;

const CRC_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32/ISO-HDLC, which is the checksum a ZIP central directory carries. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    // The `?? 0` satisfies noUncheckedIndexedAccess. A typed array never yields
    // undefined in range, so it costs nothing at runtime.
    const byte = bytes[i] ?? 0;
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Builds the archive.
 *
 * Every entry is stamped 1980-01-01 00:00, the earliest a DOS timestamp can
 * express, rather than the current time. That makes the bytes a pure function
 * of the input, so a test can compare two runs, and so exporting the same sheet
 * twice does not produce two files that differ only in a header nobody reads.
 */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const body = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(body);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header signature
    header.setUint16(4, 20, true); // version needed: 2.0
    header.setUint16(6, 0, true); // flags
    header.setUint16(8, 0, true); // method 0 = STORE
    header.setUint16(10, 0, true); // modified time 00:00:00
    header.setUint16(12, 0x0021, true); // modified date 1980-01-01
    header.setUint32(14, crc, true);
    header.setUint32(18, body.length, true); // compressed size
    header.setUint32(22, body.length, true); // uncompressed size
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true); // extra field length
    local.push(new Uint8Array(header.buffer), nameBytes, body);

    const dirEntry = new DataView(new ArrayBuffer(46));
    dirEntry.setUint32(0, 0x02014b50, true); // central directory signature
    dirEntry.setUint16(4, 20, true); // version made by
    dirEntry.setUint16(6, 20, true); // version needed
    dirEntry.setUint16(8, 0, true); // flags
    dirEntry.setUint16(10, 0, true); // method
    dirEntry.setUint16(12, 0, true);
    dirEntry.setUint16(14, 0x0021, true);
    dirEntry.setUint32(16, crc, true);
    dirEntry.setUint32(20, body.length, true);
    dirEntry.setUint32(24, body.length, true);
    dirEntry.setUint16(28, nameBytes.length, true);
    dirEntry.setUint16(30, 0, true); // extra
    dirEntry.setUint16(32, 0, true); // comment
    dirEntry.setUint16(34, 0, true); // disk number
    dirEntry.setUint16(36, 0, true); // internal attrs
    dirEntry.setUint32(38, 0, true); // external attrs
    dirEntry.setUint32(42, offset, true); // offset of local header
    central.push(new Uint8Array(dirEntry.buffer), nameBytes);

    offset += 30 + nameBytes.length + body.length;
    if (offset > MAX_ZIP_BYTES) {
      throw new Error('zipStore: archive exceeds the 4GB ZIP32 limit');
    }
  }

  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(4, 0, true); // this disk
  end.setUint16(6, 0, true); // disk with central directory
  end.setUint16(8, entries.length, true); // entries on this disk
  end.setUint16(10, entries.length, true); // entries total
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true); // central directory offset
  end.setUint16(20, 0, true); // comment length

  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
