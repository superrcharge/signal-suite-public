/**
 * Who can talk to whom on an operation, and through which asset, in which phase.
 *
 * WHY THIS IS NOT `buildMatrix`. The catalog's joint matrix says THAT a
 * platform carries a waveform; an operator planning a link needs to know
 * WHICH of the things a unit brought gives it that row, and in which phase of
 * the operation that asset is there at all. `buildMatrix` keeps one boolean
 * per cell and has no notion of phases, so it cannot say "the Black Hawk,
 * through its AN/PRC-152" or "only after phase 2". This module keeps the
 * source of every cell, and the phase rule that decides whether a source is
 * there.
 *
 * Three kinds of asset are a source: a platform (which supplies its own
 * waveforms and those of the radios it carries), a catalog equipment record,
 * and a transport (which supplies itself). The row vocabulary mirrors
 * `buildMatrix`: library order for waveforms, so an abbrev the library does
 * not declare gives no row.
 *
 * Pure, like `compat-matrix-model.ts`: no React, no services, no router.
 */

import type { Equipment, Participant, Platform, Service, Transport, Waveform } from '@/types';
import { compareNatural } from '@/utils';
import { equipmentServices, equipmentWaveforms, platformWaveforms } from './participant-waveforms';
import { participantLabel } from './participant-label';
import { norm, transportLabel } from './pick-strip-styles';

export type SourceKind = 'platform' | 'equipment' | 'transport';

/** One asset an organization brought, and what it supplies. */
export interface Source {
  participantId: string;
  kind: SourceKind;
  /** The asset id. */
  id: string;
  /** Platform: designation; equipment: nomenclature; transport: its label. The id when the name is blank or the asset unknown. Never a derived abbreviation. */
  label: string;
  /**
   * Normalised waveform key to the labels of the carried radios that supply
   * it. Platform sources only, and only for a waveform the platform's own list
   * does not name: an empty array means the platform's own list supplies it.
   */
  via: Record<string, string[]>;
  /** Display spellings, deduped case-insensitively. */
  waveforms: string[];
  services: string[];
  /** A transport source provides itself; every other kind provides none. */
  transportIds: string[];
  /** What the card's badge calls it: platform, radio, satcom or transport. */
  caption: 'platform' | 'radio' | 'satcom' | 'transport';
}

export type InteropSection = 'waveform' | 'service' | 'transport';

export interface InteropColumn {
  participantId: string;
  /** The organization key, or the participant id for an ad hoc row. */
  key: string;
  label: string;
  name: string;
  branch: string;
  color: string;
  /** This organization's sources that are present under the phase rule. */
  sources: Source[];
}

export interface InteropCell {
  /** The sources giving the row that are present under the phase rule. */
  sources: Source[];
}

export interface InteropRow {
  section: InteropSection;
  /** Normalised for comparison; `label` is what gets drawn. */
  key: string;
  label: string;
  name: string;
  /** Parallel to `columns`. */
  cells: InteropCell[];
  /** Columns whose cell has a source present in the chosen phase. Always at least one: a row nobody provides is not a row. */
  shared: number;
}

/**
 * Only what is there under the chosen phase is in the model. An organization
 * with nothing present in the phase is not a column and a row nobody provides
 * in it is not a row, so a phase leaves no dimmed or struck trace of what it
 * lacks. With no phase every organization is a column, whatever it brought.
 */
export interface InteropModel {
  phaseId: string | null;
  columns: InteropColumn[];
  rows: InteropRow[];
}

export interface InteropInput {
  participants: Participant[];
  platformById: ReadonlyMap<string, Platform>;
  equipmentById: ReadonlyMap<string, Equipment>;
  transportById: ReadonlyMap<string, Transport>;
  /** The library, for row order and names. */
  waveforms: Waveform[];
  /** The library, for service names only: a service row exists because a source provides it. */
  services?: Service[];
  /** Null is every phase. */
  phaseId: string | null;
}

/**
 * Whether the asset is there under the phase rule. A phase asks whether the
 * asset's list names it; no phase asks whether the asset is in any phase at
 * all. An asset with no key is in every phase, which is what the server
 * writes for one a request omitted.
 */
export function isPresent(p: Participant, assetId: string, phaseId: string | null): boolean {
  const list = p.asset_phases?.[assetId];
  if (list === undefined) return true;
  return phaseId === null ? list.length > 0 : list.includes(phaseId);
}

/** Display spellings deduped case-insensitively, first spelling kept, blanks dropped. */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of list) {
    const k = norm(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

function platformSource(p: Participant, pl: Platform, equipmentById: ReadonlyMap<string, Equipment>): Source {
  const own = new Set(pl.waveform_abbrevs.map(norm));
  const via: Record<string, string[]> = {};
  const services: string[] = [];
  for (const eid of pl.equipment_ids) {
    const eq = equipmentById.get(eid);
    if (!eq) continue;
    const name = eq.nomenclature || eq.id;
    for (const a of equipmentWaveforms(eq)) {
      const k = norm(a);
      if (own.has(k)) continue;
      via[k] = [...(via[k] ?? []), name];
    }
    if (eq.terminal_type !== 'radio') services.push(...equipmentServices(eq));
  }
  // The platform's own list wins, so a waveform it names carries an empty via
  // even when a carried radio supplies it too.
  for (const k of own) via[k] = [];
  return {
    participantId: p.id,
    kind: 'platform',
    id: pl.id,
    label: pl.designation || pl.id,
    via,
    waveforms: platformWaveforms(pl, equipmentById),
    services: dedupe(services),
    transportIds: [],
    caption: 'platform',
  };
}

function equipmentSource(p: Participant, eq: Equipment): Source {
  return {
    participantId: p.id,
    kind: 'equipment',
    id: eq.id,
    label: eq.nomenclature || eq.id,
    via: {},
    waveforms: equipmentWaveforms(eq),
    services: eq.terminal_type !== 'radio' ? equipmentServices(eq) : [],
    transportIds: [],
    caption: eq.terminal_type === 'radio' ? 'radio' : 'satcom',
  };
}

function transportSource(p: Participant, id: string, t: Transport | undefined): Source {
  return {
    participantId: p.id,
    kind: 'transport',
    id,
    label: t ? transportLabel(t) : id,
    via: {},
    waveforms: [],
    services: [],
    transportIds: [id],
    caption: 'transport',
  };
}

/**
 * Every asset a participant brought that is present under the phase rule:
 * platforms, then equipment, then transports, each in the order the row
 * lists them. A platform or equipment id the maps do not know is skipped; an
 * unknown transport is still a source, labelled by its id, because it is
 * still something the organization brought.
 */
export function assetSources(
  p: Participant,
  input: Omit<InteropInput, 'participants' | 'waveforms' | 'services'>,
): Source[] {
  const { platformById, equipmentById, transportById, phaseId } = input;
  const out: Source[] = [];
  for (const id of p.platform_ids) {
    const pl = platformById.get(id);
    if (pl && isPresent(p, id, phaseId)) out.push(platformSource(p, pl, equipmentById));
  }
  for (const id of p.equipment_ids) {
    const eq = equipmentById.get(id);
    if (eq && isPresent(p, id, phaseId)) out.push(equipmentSource(p, eq));
  }
  for (const id of p.transport_ids) {
    if (isPresent(p, id, phaseId)) out.push(transportSource(p, id, transportById.get(id)));
  }
  return out;
}

export function buildInterop(input: InteropInput): InteropModel {
  const { participants, phaseId } = input;
  // Under a phase an organization with nothing in it is not a column, and a
  // row exists only when some column provides it there.
  const columns: InteropColumn[] = participants
    .map((p): InteropColumn => ({
      participantId: p.id,
      key: p.organization_key || p.id,
      label: participantLabel(p),
      name: p.organization.name,
      branch: p.organization.branch,
      color: p.organization.color,
      sources: assetSources(p, input),
    }))
    .filter((c) => phaseId === null || c.sources.length > 0);

  const rows: InteropRow[] = [];
  const cellsFor = (match: (s: Source) => boolean): InteropCell[] => columns.map((c) => ({
    sources: c.sources.filter(match),
  }));
  const push = (section: InteropSection, key: string, label: string, name: string, cells: InteropCell[]) => {
    const shared = cells.filter((c) => c.sources.length > 0).length;
    if (shared === 0) return;
    rows.push({ section, key, label, name, cells, shared });
  };

  for (const w of input.waveforms) {
    const key = norm(w.abbrev);
    push('waveform', key, w.abbrev, w.name, cellsFor((s) => s.waveforms.some((a) => norm(a) === key)));
  }

  const serviceName = new Map((input.services ?? []).map((s) => [norm(s.abbrev), s.name]));
  const serviceLabels = new Map<string, string>();
  for (const c of columns) {
    for (const s of c.sources) {
      for (const a of s.services) {
        const k = norm(a);
        if (k && !serviceLabels.has(k)) serviceLabels.set(k, a);
      }
    }
  }
  for (const [key, label] of [...serviceLabels].sort((a, b) => compareNatural(a[1], b[1]))) {
    push('service', key, label, serviceName.get(key) ?? '', cellsFor((s) => s.services.some((a) => norm(a) === key)));
  }

  const transportLabels = new Map<string, string>();
  for (const c of columns) {
    for (const s of c.sources) {
      if (s.kind === 'transport' && !transportLabels.has(s.id)) transportLabels.set(s.id, s.label);
    }
  }
  for (const [id, label] of [...transportLabels].sort((a, b) => compareNatural(a[1], b[1]))) {
    push('transport', id, label, '', cellsFor((s) => s.transportIds.includes(id)));
  }

  return { phaseId, columns, rows };
}
