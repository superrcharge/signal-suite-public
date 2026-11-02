/**
 * What a package has to satisfy before it is worth opening in PowerPoint,
 * checked by parsing every part rather than trusting that a reader tolerates
 * them. `python-pptx` parses lazily, so it accepted every malformed package this
 * repo produced; a consumer that reads the lot did not. See AGENTS.md, "The
 * slide export, where every trap is a silent one".
 *
 * Returns what is wrong, as sentences; an empty list is a package that passes.
 * Used by tests only, so it is here rather than in the writer.
 */
import type { ZipEntry } from './zip-store';

const text = (data: string | Uint8Array) => (typeof data === 'string' ? data : new TextDecoder().decode(data));

function relsFor(part: string): string {
  const slash = part.lastIndexOf('/');
  const dir = slash === -1 ? '' : part.slice(0, slash + 1);
  return `${dir}_rels/${part.slice(slash + 1)}.rels`;
}

function resolve(fromPart: string, target: string): string {
  const segments = fromPart.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment !== '.') segments.push(segment);
  }
  return segments.join('/');
}

/** The EOT header's magic, at offset 34, which an sfnt does not carry. */
const EOT_MAGIC = 0x504c;

export function packageProblems(parts: readonly ZipEntry[]): string[] {
  const problems: string[] = [];
  const parser = new DOMParser();
  const byName = new Map(parts.map((p) => [p.name, p.data]));
  const names = new Set(byName.keys());

  // Every XML part parses.
  const docs = new Map<string, Document>();
  for (const part of parts) {
    if (typeof part.data !== 'string') continue;
    const doc = parser.parseFromString(part.data, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) problems.push(`${part.name} is not well-formed XML`);
    else docs.set(part.name, doc);
  }

  // Every part has a content type: its own Override, or a Default for its extension.
  const types = docs.get('[Content_Types].xml');
  const overrides = new Set(Array.from(types?.getElementsByTagName('Override') ?? []).map((e) => e.getAttribute('PartName')));
  const defaults = new Set(Array.from(types?.getElementsByTagName('Default') ?? []).map((e) => e.getAttribute('Extension')));
  for (const name of names) {
    if (name === '[Content_Types].xml') continue;
    const ext = name.slice(name.lastIndexOf('.') + 1);
    // An .xml part is only well typed by an Override; the Default is the catch-all and says nothing about what the part is.
    const typed = overrides.has(`/${name}`) || (ext !== 'xml' && defaults.has(ext));
    if (!typed) problems.push(`${name} has no content type`);
  }
  for (const name of overrides) {
    if (name && !names.has(name.slice(1))) problems.push(`${name} is declared in the content types and is not in the package`);
  }

  // The relationship graph closes: every Target exists, every r:id and r:embed is declared in its part's rels.
  for (const part of parts) {
    const rels = docs.get(relsFor(part.name));
    if (!rels) continue;
    const declared = new Set<string>();
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      declared.add(rel.getAttribute('Id') ?? '');
      const target = resolve(part.name, rel.getAttribute('Target') ?? '');
      if (!names.has(target)) problems.push(`${part.name} relates to ${target}, which is not in the package`);
    }
    if (typeof part.data === 'string') {
      for (const m of part.data.matchAll(/r:(?:id|embed)="([^"]+)"/g)) {
        if (m[1] && !declared.has(m[1])) problems.push(`${part.name} uses ${m[1]}, which its relationships do not declare`);
      }
    }
  }

  // Everything is reachable from the root, so nothing is an orphan.
  const reached = new Set<string>();
  const walk = (relsName: string, base: string) => {
    const doc = docs.get(relsName);
    if (!doc) return;
    for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
      const target = resolve(base, rel.getAttribute('Target') ?? '');
      if (reached.has(target)) continue;
      reached.add(target);
      walk(relsFor(target), target);
    }
  };
  walk('_rels/.rels', 'root');
  for (const name of names) {
    if (!reached.has(name) && !name.includes('_rels/') && name !== '[Content_Types].xml') problems.push(`${name} is not reachable from the package root`);
  }

  // Each slide: shape ids are unique, and every connector is attached to a shape that is on the slide.
  for (const [name, doc] of docs) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const ids = Array.from(doc.getElementsByTagName('p:cNvPr')).map((e) => e.getAttribute('id') ?? '');
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${name} uses shape id ${id} twice`);
      seen.add(id);
    }
    for (const tag of ['a:stCxn', 'a:endCxn']) {
      for (const cxn of Array.from(doc.getElementsByTagName(tag))) {
        const id = cxn.getAttribute('id') ?? '';
        if (!seen.has(id)) problems.push(`${name} has a connector attached to shape ${id}, which is not on the slide`);
        const idx = Number(cxn.getAttribute('idx'));
        if (!Number.isInteger(idx) || idx < 0 || idx > 3) problems.push(`${name} has a connector at connection site ${String(idx)}`);
      }
    }
  }

  // Each native table: every row has one cell per grid column, and a cell that spans n of them is followed by n - 1 merged placeholders.
  for (const [name, doc] of docs) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    for (const tbl of Array.from(doc.getElementsByTagName('a:tbl'))) {
      const cols = tbl.getElementsByTagName('a:gridCol').length;
      Array.from(tbl.getElementsByTagName('a:tr')).forEach((tr, r) => {
        const cells = Array.from(tr.children).filter((c) => c.tagName === 'a:tc');
        if (cells.length !== cols) problems.push(`${name} has a table row ${r + 1} of ${cells.length} cells in a grid of ${cols} columns`);
        cells.forEach((cell, i) => {
          const span = Number(cell.getAttribute('gridSpan') ?? '1');
          for (let k = 1; k < span; k++) {
            if (cells[i + k]?.getAttribute('hMerge') !== '1') problems.push(`${name} has a table cell spanning ${span} columns with no merged cell after it`);
          }
        });
      });
    }
  }

  // Fonts are EOT: the header's magic is there and the file does not begin as an sfnt.
  for (const part of parts) {
    if (!part.name.startsWith('ppt/fonts/')) continue;
    const bytes = typeof part.data === 'string' ? new TextEncoder().encode(part.data) : part.data;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(34, true) !== EOT_MAGIC) problems.push(`${part.name} is not an EOT: no magic at offset 34`);
    const head = String.fromCharCode(...bytes.subarray(0, 4));
    if (head === '\u0000\u0001\u0000\u0000' || head === 'OTTO' || head === 'true') problems.push(`${part.name} begins as a raw sfnt`);
    if (view.getUint32(0, true) !== bytes.length) problems.push(`${part.name} declares a different length than it has`);
  }

  // The deck's presentation lists the embedded fonts after notesSz, and each is a part it relates.
  const presentation = text(byName.get('ppt/presentation.xml') ?? '');
  if (presentation.includes('<p:embeddedFontLst>') && presentation.indexOf('<p:notesSz') > presentation.indexOf('<p:embeddedFontLst>')) {
    problems.push('embeddedFontLst comes before notesSz');
  }
  return problems;
}
