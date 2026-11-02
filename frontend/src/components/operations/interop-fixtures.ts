import type { InteropColumn, InteropModel, InteropRow, InteropSection, Source, SourceKind } from './interop-model';

/** A source for a view test, with the fields a view never reads left empty. */
export function source(participantId: string, kind: SourceKind, id: string, label: string, via: Record<string, string[]> = {}): Source {
  return { participantId, kind, id, label, via, waveforms: [], services: [], transportIds: [], caption: kind === 'equipment' ? 'radio' : kind };
}

/** A column whose sources are the ones present in the chosen phase. */
export function column(key: string, color: string, branch: string, sources: Source[]): InteropColumn {
  return {
    participantId: `row-${key}`, key, label: key.toUpperCase(), name: `${key} org`, branch, color, sources,
  };
}

/** A row whose cells are given per column, in column order. */
export function row(
  section: InteropSection, key: string, label: string, name: string, cells: Source[][],
): InteropRow {
  return {
    section, key, label, name,
    cells: cells.map((sources) => ({ sources })),
    shared: cells.filter((c) => c.length > 0).length,
  };
}

export function model(columns: InteropColumn[], rows: InteropRow[], phaseId: string | null = null): InteropModel {
  return { phaseId, columns, rows };
}
