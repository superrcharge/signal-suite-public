/**
 * What a phase asks of its units, and whether the units can deliver it.
 *
 * A phase names pairs of participants that must be able to talk, and the
 * interop model for that phase says what each unit has. `pairStatus` joins
 * the two for one pair: they share a means, or one more unit can pass their
 * traffic, or they have nothing in common. Nothing here asks whether
 * "everyone reaches everyone", because that is not the question a phase
 * poses: people talk to who they need to talk to.
 *
 * Pure, like `interop-model.ts`: no React, no services, no router.
 */

import { STATUS_COLORS } from '@/theme/asset-colors';
import type { Participant, Phase } from '@/types';
import type { InteropModel } from './interop-model';
import { participantLabel } from './participant-label';

export type PairStatus =
  /** Both are in the phase and share these rows, waveforms first, then services, then transports. */
  | { status: 'direct'; means: string[] }
  /** No shared row, but a chain of units that each share one with the next: the participant ids between the two, in order from the first. */
  | { status: 'relay'; via: string[] }
  /** Both are in the phase and nothing links them, even through others. */
  | { status: 'cannot' }
  /** At least one of the two holds nothing in the phase, so is not a column; their participant ids. */
  | { status: 'absent'; missing: string[] };

/** The colour a line and a summary wear for each answer; `absent` has no line, so no colour. */
export const PAIR_COLOR: Record<'direct' | 'relay' | 'cannot', string> = {
  direct: STATUS_COLORS.available,
  relay: 'var(--shf-amber-deep)',
  cannot: 'var(--shf-error)',
};

/** The glyph that heads a status wherever it is written out, so it reads without decoding a colour or a dash. */
export const PAIR_GLYPH: Record<'direct' | 'relay' | 'cannot', string> = { direct: '✓', relay: '↻', cannot: '✕' };

/**
 * Whether two participants can talk in the phase the model was built for.
 *
 * They are linked when they share a row, meaning both have a source for it in
 * the phase. The planning assumption, stated by the people who plan with it,
 * is that a unit holding two means can pass traffic between them
 * (retransmission, cross-banding), so two units that share nothing but are
 * each linked to a third are `relay` through it. The path is a shortest one
 * with ties broken by column order, so the answer is the same on every render.
 * A unit with nothing present in the phase is not a column and is `absent`.
 */
export function pairStatus(model: InteropModel, aId: string, bId: string): PairStatus {
  const { columns, rows } = model;
  const from = columns.findIndex((c) => c.participantId === aId);
  const to = columns.findIndex((c) => c.participantId === bId);
  if (from < 0 || to < 0) {
    return {
      status: 'absent',
      missing: [from < 0 ? aId : null, to < 0 ? bId : null].filter((id): id is string => id !== null),
    };
  }

  const n = columns.length;
  const linked: boolean[][] = columns.map(() => columns.map(() => false));
  for (const r of rows) {
    const holders = r.cells.flatMap((c, i) => (c.sources.length > 0 ? [i] : []));
    for (const x of holders) for (const y of holders) if (x !== y) linked[x]![y] = true;
  }

  if (linked[from]![to]) {
    const means = rows.filter((r) => r.cells[from]!.sources.length > 0 && r.cells[to]!.sources.length > 0).map((r) => r.label);
    return { status: 'direct', means };
  }

  // Breadth first, so the first time a column is reached is by a shortest path.
  const parent = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    for (let next = 0; next < n; next++) {
      if (linked[at]![next] && !parent.has(next)) {
        parent.set(next, at);
        queue.push(next);
      }
    }
  }
  if (!parent.has(to)) return { status: 'cannot' };
  const via: string[] = [];
  for (let at = parent.get(to)!; at !== from; at = parent.get(at)!) via.unshift(columns[at]!.participantId);
  return { status: 'relay', via };
}

/** One requirement of a phase with both units' labels and whether the units can deliver it. */
export interface RequirementEntry {
  id: string;
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  status: PairStatus;
}

/**
 * One entry per requirement of the phase, in the order the phase lists them.
 * `participants` names the units, including ones absent from the phase, which
 * the model has no column for; an id it does not know is labelled by itself.
 */
export function phaseRequirements(phase: Phase, model: InteropModel, participants: Participant[]): RequirementEntry[] {
  const labels = new Map(participants.map((p) => [p.id, participantLabel(p)]));
  const label = (id: string) => labels.get(id) ?? id;
  return phase.requirements.map((r) => ({
    id: r.id, a: r.a, b: r.b, aLabel: label(r.a), bLabel: label(r.b),
    status: pairStatus(model, r.a, r.b),
  }));
}
