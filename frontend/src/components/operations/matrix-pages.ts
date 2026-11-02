/**
 * What each slide, and each printed page, of the operation's Matrix is about,
 * worked out from the model alone: "All phases" first, then one phase after
 * another in phase order, each cut into as many pages as its grid needs.
 *
 * A grid wider than a page is cut by columns, into groups as even as it can
 * make them, and one taller than a page is cut by rows; every page repeats the
 * label column and the header, and a page that starts part way down a section
 * says which section it is in. Where the cuts fall depends on the paper, so the
 * measures arrive as a `MatrixPaging` and the slide and the printed page each
 * bring their own. Pure, like `phase-deck-plan.ts`: no React and no DOM, so the
 * rule that a deck has one slide per phase and one more for all of them is
 * asserted here rather than through a rendered grid.
 */

import type { Operation, Phase } from '@/types';
import { buildInterop } from './interop-model';
import type { InteropColumn, InteropInput, InteropModel, InteropRow } from './interop-model';

/** The measures a page is cut by. Every height is in one unit and every width in another, the caller's, and only the callbacks need agree with them. */
export interface MatrixPaging {
  /** The most organization columns one page holds. */
  maxCols: number;
  /** What a page's table may take in all: its header, its section lines and its rows. */
  height: number;
  /** The header row of a page whose columns are `columns`, in a group of `groupSize`. */
  headHeight: (columns: InteropColumn[], groupSize: number) => number;
  /** A section line, which a page puts above its first row and above any row that starts a section. */
  sectionHeight: number;
  /** One row, as it comes out over `columns`. */
  rowHeight: (row: InteropRow, columns: InteropColumn[], groupSize: number) => number;
}

export interface MatrixPage {
  /** The phase the page is of; null is All phases. */
  phaseId: string | null;
  /** "All phases" or the phase's name, with no part number. */
  scope: string;
  /** What the page says at its head: the operation, Matrix, the scope, and "(2 of 3)" when there is more than one. */
  title: string;
  /** From 1, among the pages of this scope. */
  part: number;
  parts: number;
  /** This page's columns and rows, each row's cells cut to match. An empty model is a page that says there is nothing to draw. */
  model: InteropModel;
}

export interface MatrixDeckPlan {
  pages: MatrixPage[];
}

/** `count` columns into the fewest groups of at most `max`, as even as they go: 7 columns at 4 to a page are 4 and 3, and 9 at 4 are 3, 3 and 3. */
export function columnGroups(count: number, max: number): [number, number][] {
  const groups = Math.max(1, Math.ceil(count / Math.max(1, max)));
  const base = Math.floor(count / groups);
  const extra = count % groups;
  const out: [number, number][] = [];
  let start = 0;
  for (let g = 0; g < groups; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push([start, start + size]);
    start += size;
  }
  return out;
}

/** The model cut to columns `[from, to)`, every row's cells with it. */
function sliceColumns(model: InteropModel, from: number, to: number): InteropModel {
  return {
    phaseId: model.phaseId,
    columns: model.columns.slice(from, to),
    rows: model.rows.map((r) => ({ ...r, cells: r.cells.slice(from, to) })),
  };
}

/**
 * One model as the models of its pages: by column groups first, and within a
 * group by rows, a row going to the next page when it would not fit under the
 * ones already on this one. A row taller than a page still gets a page of its
 * own, because there is nothing smaller to cut it into. A model with nothing in
 * it is one page, which says so.
 */
export function pageModels(model: InteropModel, paging: MatrixPaging): InteropModel[] {
  if (model.columns.length === 0 || model.rows.length === 0) return [model];
  const pages: InteropModel[] = [];
  for (const [from, to] of columnGroups(model.columns.length, paging.maxCols)) {
    const cut = sliceColumns(model, from, to);
    const size = cut.columns.length;
    const budget = paging.height - paging.headHeight(cut.columns, size);
    let chunk: InteropRow[] = [];
    let used = 0;
    let section: InteropRow['section'] | null = null;
    const flush = () => {
      if (chunk.length > 0) pages.push({ phaseId: cut.phaseId, columns: cut.columns, rows: chunk });
      chunk = [];
      used = 0;
      section = null;
    };
    for (const row of cut.rows) {
      const cost = (opens: boolean) => paging.rowHeight(row, cut.columns, size) + (opens ? paging.sectionHeight : 0);
      if (chunk.length > 0 && used + cost(row.section !== section) > budget) flush();
      used += cost(row.section !== section);
      section = row.section;
      chunk.push(row);
    }
    flush();
  }
  return pages;
}

/**
 * All phases, then each phase by position, as pages. A phase's pages are
 * numbered among themselves, so a phase that fits one page is not "(1 of 1)".
 * With no phases there is only All phases.
 */
export function planMatrixDeck(args: {
  operation: Pick<Operation, 'name'>;
  phases: Phase[];
  input: Omit<InteropInput, 'phaseId'>;
  paging: MatrixPaging;
  /**
   * One scope only: a phase id, or null for All phases. The share menu's
   * .pptx passes the phase on screen (maintainer, 2026-10-13: the deck should
   * be the one you are looking at); left out, every scope is planned, which
   * is what the print page starts from.
   */
  only?: string | null;
}): MatrixDeckPlan {
  const all: { phaseId: string | null; scope: string }[] = [
    { phaseId: null, scope: 'All phases' },
    ...[...args.phases].sort((a, b) => a.position - b.position).map((p) => ({ phaseId: p.id, scope: p.name })),
  ];
  const scopes = args.only === undefined ? all : all.filter((s) => s.phaseId === args.only);
  const pages = scopes.flatMap(({ phaseId, scope }): MatrixPage[] => {
    const models = pageModels(buildInterop({ ...args.input, phaseId }), args.paging);
    return models.map((model, i) => ({
      phaseId,
      scope,
      title: `${args.operation.name} - Matrix - ${scope}${models.length > 1 ? ` (${String(i + 1)} of ${String(models.length)})` : ''}`,
      part: i + 1,
      parts: models.length,
      model,
    }));
  });
  return { pages };
}

/** What a page with nothing on it says, in the screen's own words. */
export function emptyMatrixText(model: InteropModel): string {
  return model.phaseId === null ? 'No waveforms to compare. Add waveforms to the Comms Library.' : 'Nothing is in this phase.';
}
