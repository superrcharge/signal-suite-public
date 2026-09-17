/**
 * The joint compatibility matrix, as a pure function.
 *
 * WHY THIS IS A MODULE AND NOT JSX. The matrix answers "which waveforms can
 * all of these assets actually talk on", which is the input to a PACE across a
 * joint force. That is arithmetic over three lists, and arithmetic asserted by
 * rendering is arithmetic nobody can test at the edges - an empty selection, a
 * platform whose only source is a carried radio, an abbrev the library has
 * never heard of and therefore gives no row. Same shape as
 * `compare-selection.ts`, `csv-selection.ts` and `help/route-coverage.ts`.
 *
 * WHAT IT REPLACES, AND WHAT IT DELIBERATELY DOES NOT. `CompatibilityMatrix`
 * already draws a waveform-by-radio cross-tab on one record's data sheet, fed
 * by `equipment.data.compatibility.comparisons[]`. Two properties of that
 * feature make it unable to answer the question above, and both are by design
 * for what a printed data sheet is:
 *
 *   1. A column can only be another row of the Equipment catalog. An airframe
 *      could only become a column by being entered as equipment we own, with
 *      no SWAP, no power draw and no gain - and it would then appear in the
 *      browse facets and the compare picker as if we held one.
 *   2. Each column is a SNAPSHOT. Toggling a radio on copies its waveform
 *      abbrevs into *this* record's JSONB, so ten radios compared against the
 *      same platform hold ten independent copies and the first edit makes nine
 *      of them wrong.
 *
 * (2) is the disqualifying one for a matrix read across every asset at once,
 * and it is the reason this module takes the platform and equipment lists and
 * resolves abbrevs at call time instead of reading a stored cross-product.
 * Section 03b keeps its snapshots, which is correct for a sheet that records
 * what was true when it was printed.
 *
 * Nothing here imports React, the services layer or the router.
 */

import type { Equipment, Platform, Waveform } from '@/types';

/** Where a column's row came from. Equipment is ours by definition. */
export type ColumnKind = 'platform' | 'equipment';

export interface MatrixColumn {
  /** Platform id or equipment id. Unique across both, since both are uuids. */
  id: string;
  kind: ColumnKind;
  /** Designation or nomenclature - the name on the column head. */
  label: string;
  /** Popular name or nickname, shown smaller. */
  sublabel: string;
  /**
   * A platform's own category. Equipment is always `organic`: a record in our
   * catalog is a thing we hold, and that is the whole meaning of the word here.
   */
  category: string;
  /** Service or nation, for a platform. Empty for equipment. */
  operator: string;
}

/**
 * One intersection. A single boolean on purpose: whether the waveform was
 * typed against the platform or arrived through a radio it carries is a fact
 * about which editor strip it was ticked in, not about compatibility. A
 * platform that carries a radio with a waveform has that waveform. Variants
 * that differ - an airframe with the radio and one without - are two platform
 * rows, which is where that difference belongs.
 */
export interface MatrixCell {
  supported: boolean;
}

export interface MatrixRow {
  /** Normalised for comparison; `label` is what gets drawn. */
  abbrev: string;
  label: string;
  name: string;
  /** Parallel to `columns`, same order, same length. */
  cells: MatrixCell[];
  supportedCount: number;
}

export interface MatrixModel {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** Categories present across every candidate column, for the filter chips. */
  availableCategories: string[];
}

export interface MatrixInput {
  platforms: Platform[];
  /** The whole catalog. Non-radio records are dropped - see `radiosOf`. */
  equipment: Equipment[];
  /** The global library. It is the row set: every library waveform, and nothing else. */
  waveforms: Waveform[];
  /**
   * Column ids to show, in display order. Empty means every candidate, which
   * is what a cold page load wants: the matrix is useful before anything has
   * been picked, and an empty grid would read as broken.
   */
  selected?: string[];
  /** Category filter. Empty or absent means no filtering. */
  categories?: string[];
  /**
   * Drop rows no column carries. Off by default, because an all-dashes row is
   * a real finding - it says the library knows a waveform that nothing in this
   * selection can use. On, for a print sheet that should not spend a page on
   * them.
   */
  omitEmptyRows?: boolean;
}

/** Abbrevs are compared case-insensitively and trimmed, never by identity. */
function norm(abbrev: string): string {
  return abbrev.trim().toLowerCase();
}

/**
 * Only radios become equipment columns.
 *
 * A SATCOM terminal carries `services` (CIR/MIR bearers), not waveforms, so it
 * has nothing to contribute to a waveform cross-tab and an all-dashes column
 * would claim it was incompatible rather than unrelated. This is the same
 * filter Section 03b applies as `inventoryRadios`.
 */
function radiosOf(equipment: Equipment[]): Equipment[] {
  return equipment.filter((e) => e.terminal_type === 'radio');
}

function equipmentLabel(e: Equipment): string {
  return e.nomenclature || e.nickname || e.id;
}

/** Abbrevs a radio record carries, from its own waveform snapshot. */
function radioAbbrevs(e: Equipment): string[] {
  return (e.data?.waveforms ?? []).map((w) => w.abbrev).filter((a) => a.trim() !== '');
}

interface Candidate {
  column: MatrixColumn;
  /** Normalised abbrevs the column supports, from every source it has. */
  abbrevs: Set<string>;
}

function candidatesOf(input: MatrixInput): Candidate[] {
  const radios = radiosOf(input.equipment);
  const byId = new Map(radios.map((r) => [r.id, r]));

  const platformCandidates: Candidate[] = input.platforms.map((p) => {
    const abbrevs = new Set((p.waveform_abbrevs ?? []).filter((a) => a.trim() !== '').map(norm));

    // A platform's effective set is its own abbrevs UNION every carried
    // radio's. Both sources are real and neither is redundant: you often know
    // an airframe carries Link 16 and MADL without knowing the LRU, and you
    // sometimes know the radio and want its waveforms to follow when the
    // catalog row changes. Resolved here rather than stored, which is the
    // whole point - see the header.
    for (const id of p.equipment_ids ?? []) {
      const radio = byId.get(id);
      // An id naming a record that has been deleted, or one that is no longer
      // a radio, contributes nothing and is not an error. Same tolerance the
      // rest of this schema has for a dangling reference.
      if (!radio) continue;
      for (const abbrev of radioAbbrevs(radio)) abbrevs.add(norm(abbrev));
    }

    return {
      column: {
        id: p.id,
        kind: 'platform',
        label: p.designation,
        sublabel: p.popular_name ?? '',
        category: p.category,
        operator: p.operator ?? '',
      },
      abbrevs,
    };
  });

  const equipmentCandidates: Candidate[] = radios.map((e) => ({
    column: {
      id: e.id,
      kind: 'equipment',
      label: equipmentLabel(e),
      sublabel: e.nickname ?? '',
      category: 'organic',
      operator: '',
    },
    abbrevs: new Set(radioAbbrevs(e).map(norm)),
  }));

  return [...platformCandidates, ...equipmentCandidates];
}

export function buildMatrix(input: MatrixInput): MatrixModel {
  const candidates = candidatesOf(input);

  // Computed before any filtering, so narrowing to JOINT does not make the
  // other chips disappear and strand the user in a filter they cannot leave.
  const availableCategories = [...new Set(candidates.map((c) => c.column.category))].sort();

  const wanted = new Set(input.categories ?? []);
  const inCategory =
    wanted.size === 0 ? candidates : candidates.filter((c) => wanted.has(c.column.category));

  const picked = new Set(input.selected ?? []);
  let chosen =
    picked.size === 0
      ? [...inCategory].sort((a, b) => a.column.label.localeCompare(b.column.label))
      : // Selection order is display order, so a user who picks their own
        // asset first sees it in the leftmost column. Ids not among the
        // candidates - stale, or filtered out by category - are skipped.
        (input.selected ?? [])
          .map((id) => inCategory.find((c) => c.column.id === id))
          .filter((c): c is Candidate => c !== undefined);

  // Deduplicate a repeated id rather than drawing the column twice.
  const seen = new Set<string>();
  chosen = chosen.filter((c) => (seen.has(c.column.id) ? false : (seen.add(c.column.id), true)));

  // Row set: every waveform the library declares, and only those. A waveform
  // nothing carries still gets a row, because an all-dashes row is a finding.
  // An abbrev a column names that the library does not declare gets none: the
  // library is the vocabulary, and the equipment editor's orphan chip is where
  // such an entry is seen and removed.
  const rows: MatrixRow[] = input.waveforms.map((w) => {
    const key = norm(w.abbrev);
    const cells: MatrixCell[] = chosen.map((c) => ({ supported: c.abbrevs.has(key) }));
    return {
      abbrev: key,
      label: w.abbrev,
      name: w.name,
      cells,
      supportedCount: cells.filter((cell) => cell.supported).length,
    };
  });

  const visible = input.omitEmptyRows ? rows.filter((r) => r.supportedCount > 0) : rows;

  return { columns: chosen.map((c) => c.column), rows: visible, availableCategories };
}
