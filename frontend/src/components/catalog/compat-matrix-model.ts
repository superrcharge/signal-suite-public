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
import { compareNatural } from '@/utils';

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
   * The platform's category: the branches that operate it, already in
   * `BRANCH_ORDER` because the server stores them that way. An F-35 flown by
   * three services is one column answering to a filter on any of them. Empty
   * for a catalog radio, and for a platform with no branch set.
   */
  branches: string[];
  /**
   * The branches this column draws a check for in each supported cell: every
   * branch it has, or only those in an active branch filter, since those are
   * what brought it into the table. A UH-60L flown by USA and OGA draws a gold
   * and a black check; filtered to USA, only the gold one. Empty for a catalog
   * radio, which draws one neutral check.
   */
  checkBranches: string[];
  /**
   * The platform's own `type` (aircraft, ship, ...), or `radio` for a catalog
   * radio. Not `kind`, which already says where the column came from.
   */
  assetType: string;
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
  /** Branches present across every candidate column, in `BRANCH_ORDER`. */
  availableBranches: string[];
  /** Asset types present across every candidate column, `radio` last. */
  availableTypes: string[];
  /**
   * How many columns exist before any filter, so an empty grid can say
   * whether nothing is picked or there is nothing to pick.
   */
  candidateTotal: number;
}

/**
 * The `selected` value meaning every candidate the filters admit, in default
 * order. A token rather than the list, so a shared link for all 560 columns
 * is one word and not 20KB of ids.
 */
export const ALL_COLUMNS = 'all';

/**
 * The slice of a platform the matrix reads. Anything platform-shaped (a
 * `Platform`, or another asset kind with the same fields) can be a column.
 */
export type MatrixAsset = Pick<
  Platform,
  'id' | 'designation' | 'popular_name' | 'category' | 'waveform_abbrevs' | 'equipment_ids'
> & { type: string };

export interface MatrixInput {
  platforms: MatrixAsset[];
  /**
   * Whether catalog radios become columns of their own. Default `true`. When
   * `false` radios are still resolved through each asset's `equipment_ids`, so
   * their waveforms are unioned in, but none is a candidate column.
   */
  equipmentColumns?: boolean;
  /** The whole catalog. Non-radio records are dropped - see `radiosOf`. */
  equipment: Equipment[];
  /** The global library. It is the row set: every library waveform, and nothing else. */
  waveforms: Waveform[];
  /**
   * Column ids to show, in display order, or `[ALL_COLUMNS]` for every
   * candidate. Empty means no columns, and that is the cold page load: with
   * five hundred platforms, "everything" is a grid too wide to read, so the
   * page starts blank and asks for a pick.
   */
  selected?: string[];
  /**
   * Branch filter, any-of: a platform with several branches matches if one of
   * them is chosen. Empty or absent means no filtering. A column with no
   * branch - every catalog radio - never matches an active one, because
   * "operated by USMC" is not a claim anything here can make about it.
   */
  branches?: string[];
  /** Asset type filter, any-of. `radio` selects the catalog radios. */
  types?: string[];
  /**
   * Drop rows no column carries. Off by default, because an all-dashes row is
   * a real finding - it says the library knows a waveform that nothing in this
   * selection can use. On, for a print sheet that should not spend a page on
   * them.
   */
  omitEmptyRows?: boolean;
}

/**
 * The branches in the DoD order of precedence, then OGA. The same closed list,
 * in the same order, the server enforces and stores - see migration 044.
 */
export const BRANCH_ORDER = ['USA', 'USMC', 'USN', 'USAF', 'USSF', 'USCG', 'OGA'];

/** The picker's group for columns with no branch: the catalog radios. */
export const RADIO_GROUP = 'Radios';
/** The picker's group for a platform with no branch set. */
export const NO_BRANCH_GROUP = 'No branch';

function branchRank(branch: string): number {
  const i = BRANCH_ORDER.indexOf(branch);
  return i === -1 ? BRANCH_ORDER.length : i;
}

export function compareBranches(a: string, b: string): number {
  return branchRank(a) - branchRank(b) || compareNatural(a, b);
}

/** Where a column sorts: by its highest-precedence branch. */
function bestBranch(col: MatrixColumn): string | undefined {
  return [...col.branches].sort(compareBranches)[0];
}

/** Platforms with a branch, then platforms without one, then catalog radios. */
function band(col: MatrixColumn): number {
  if (col.kind === 'equipment') return 2;
  return col.branches.length === 0 ? 1 : 0;
}

/**
 * The default column order: grouped by branch, natural within a group, so
 * `7M RIB` precedes `11M NSW RIB`. A platform with several branches is one
 * column, placed by its highest-precedence branch.
 */
function compareColumns(a: MatrixColumn, b: MatrixColumn): number {
  const byBand = band(a) - band(b);
  if (byBand !== 0) return byBand;
  const ba = bestBranch(a);
  const bb = bestBranch(b);
  const byBranch = ba !== undefined && bb !== undefined ? compareBranches(ba, bb) : 0;
  return byBranch || compareNatural(a.label, b.label);
}

function compareTypes(a: string, b: string): number {
  return Number(a === 'radio') - Number(b === 'radio') || compareNatural(a, b);
}

export interface ColumnGroup {
  label: string;
  columns: MatrixColumn[];
}

/**
 * The column picker's rows: one per branch, in `BRANCH_ORDER` and natural
 * within. A platform with several branches appears in each of their rows, so
 * it is found under whichever service someone looks for it; every copy
 * toggles the same column. Empty groups are never produced.
 */
export function groupByBranch(columns: MatrixColumn[]): ColumnGroup[] {
  const byBranch = new Map<string, MatrixColumn[]>();
  const unowned: MatrixColumn[] = [];
  const radios: MatrixColumn[] = [];
  for (const col of columns) {
    if (col.kind === 'equipment') radios.push(col);
    else if (col.branches.length === 0) unowned.push(col);
    else for (const b of col.branches) byBranch.set(b, [...(byBranch.get(b) ?? []), col]);
  }
  const byLabel = (a: MatrixColumn, b: MatrixColumn) => compareNatural(a.label, b.label);
  const groups: ColumnGroup[] = [...byBranch.keys()]
    .sort(compareBranches)
    .map((b) => ({ label: b, columns: (byBranch.get(b) ?? []).sort(byLabel) }));
  if (unowned.length > 0) groups.push({ label: NO_BRANCH_GROUP, columns: unowned.sort(byLabel) });
  if (radios.length > 0) groups.push({ label: RADIO_GROUP, columns: radios.sort(byLabel) });
  return groups;
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
        // Guarded because a response cached from before migration 044 carries
        // the old string category, and a string is not a branch list.
        branches: Array.isArray(p.category) ? p.category : [],
        checkBranches: [],
        assetType: p.type,
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
      branches: [],
      checkBranches: [],
      assetType: 'radio',
    },
    abbrevs: new Set(radioAbbrevs(e).map(norm)),
  }));

  if (input.equipmentColumns === false) return platformCandidates;
  return [...platformCandidates, ...equipmentCandidates];
}

export function buildMatrix(input: MatrixInput): MatrixModel {
  const candidates = candidatesOf(input);

  // Computed before any filtering, so narrowing to USMC does not make the
  // other chips disappear and strand the user in a filter they cannot leave.
  // The same holds for type: the chips are the whole vocabulary, whatever is
  // currently chosen.
  const availableBranches = [...new Set(candidates.flatMap((c) => c.column.branches))].sort(compareBranches);
  const availableTypes = [...new Set(candidates.map((c) => c.column.assetType))].sort(compareTypes);

  // Any-of within a filter, all-of across them: USA + USMC and aircraft is
  // every USA or USMC aircraft.
  const wantedBranches = new Set((input.branches ?? []).map((b) => b.trim().toUpperCase()));
  const wantedTypes = new Set(input.types ?? []);
  const admitted = candidates.filter(({ column }) =>
    (wantedBranches.size === 0 || column.branches.some((b) => wantedBranches.has(b))) &&
    (wantedTypes.size === 0 || wantedTypes.has(column.assetType)));

  const selected = input.selected ?? [];
  let chosen = selected.includes(ALL_COLUMNS)
    ? [...admitted].sort((a, b) => compareColumns(a.column, b.column))
    : // Selection order is display order, so a user who picks their own
      // asset first sees it in the leftmost column. Ids not among the
      // candidates - stale, or filtered out - are skipped. Nothing selected
      // is nothing drawn.
      selected
        .map((id) => admitted.find((c) => c.column.id === id))
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

  // Set here rather than when the candidate is built, because it depends on
  // the filter, and the candidates are the filter's input.
  const columns = chosen.map(({ column }) => ({
    ...column,
    checkBranches: wantedBranches.size === 0
      ? column.branches
      : column.branches.filter((b) => wantedBranches.has(b)),
  }));

  return {
    columns,
    rows: visible,
    availableBranches,
    availableTypes,
    candidateTotal: candidates.length,
  };
}

/**
 * One printed page's share of a model: the columns at `columnIndexes`, and
 * the rows whose abbrev is in `rowKeys` (every row when omitted), each row's
 * cells cut to the same columns. The print pagination splits a matrix into
 * column chunks and row pages; this is what each page draws. Counts and
 * vocabularies are left as the whole model's, since a page is a view of the
 * matrix, not a smaller matrix.
 */
export function sliceModel(model: MatrixModel, columnIndexes: number[], rowKeys?: string[]): MatrixModel {
  const keep = rowKeys ? new Set(rowKeys) : null;
  const rows = model.rows
    .filter((r) => !keep || keep.has(r.abbrev))
    .map((r) => {
      const cells = columnIndexes.map((i) => r.cells[i] ?? { supported: false });
      return { ...r, cells, supportedCount: cells.filter((c) => c.supported).length };
    });
  return {
    ...model,
    columns: columnIndexes.map((i) => model.columns[i]).filter((c): c is MatrixColumn => c !== undefined),
    rows,
  };
}
