/**
 * What the Join wizard's Phases step edits, and how it becomes a save.
 *
 * A phase's plan is stored whole and saved whole, but the wizard is one unit's
 * view of it: where this unit sits in each phase, and who it must talk to.
 * Everything else in a stored plan (the supported unit, the other units'
 * placements and the pairs that do not name this unit) is carried through
 * unchanged, so a save from here cannot undo what someone planned on the Web
 * view.
 *
 * Pure, like `phase-plan-model.ts`: no React, no services, no router.
 */

import type { Participant, Phase, SavePhasePlanRequest } from '@/types';
import { isPresent } from './interop-model';
import { normalisePair } from './phase-plan-draft';
import { PAIR_COLOR, PAIR_GLYPH } from './phase-plan-model';
import type { PairStatus } from './phase-plan-model';

/** One unit's part of one phase's plan: its site id ("" for none) and the ids of the units it must talk to. */
export interface PhaseChoice {
  site: string;
  partners: string[];
}

export const NO_CHOICE: PhaseChoice = { site: '', partners: [] };

/** The unit's part of a stored phase. A requirement names the unit as either end of its pair. */
export function storedChoice(phase: Phase, unitId: string | undefined): PhaseChoice {
  if (unitId === undefined) return NO_CHOICE;
  return {
    site: phase.placements[unitId] ?? '',
    partners: phase.requirements.flatMap((r) => (r.a === unitId ? [r.b] : r.b === unitId ? [r.a] : [])),
  };
}

export function sameChoice(x: PhaseChoice, y: PhaseChoice): boolean {
  if (x.site !== y.site) return false;
  const a = [...new Set(x.partners)].sort();
  const b = [...new Set(y.partners)].sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Whether the draft unit has any asset in the phase, under the rule the
 * participant save will write: a picked asset with no key is in every phase.
 * A unit with nothing in a phase is not in it, so nothing there is its to plan.
 */
export function presentInPhase(unit: Participant, phaseId: string): boolean {
  return [...unit.platform_ids, ...unit.equipment_ids, ...unit.transport_ids].some((id) => isPresent(unit, id, phaseId));
}

/**
 * The phase's whole plan with this unit's part replaced: its placement set or
 * removed, and its pairs swapped for the new ones, normalised with `a` first.
 */
export function mergedPlan(phase: Phase, unitId: string, choice: PhaseChoice): SavePhasePlanRequest {
  const placements = { ...phase.placements };
  delete placements[unitId];
  if (choice.site !== '') placements[unitId] = choice.site;
  return {
    supported_participant_id: phase.supported_participant_id,
    placements,
    requirements: [
      ...phase.requirements.filter((r) => r.a !== unitId && r.b !== unitId).map(({ a, b }) => ({ a, b })),
      ...[...new Set(choice.partners)].filter((id) => id !== unitId).map((id) => normalisePair(unitId, id)),
    ],
  };
}

/**
 * One merged plan per phase whose part of this unit's plan differs from what
 * is stored, in the order given. A phase the unit is not in is never sent: its
 * controls are disabled, and what was chosen before gear came out of it is not
 * a decision to save.
 */
export function changedPlans(
  phases: Phase[],
  unitId: string,
  edits: Record<string, PhaseChoice>,
  present: (phaseId: string) => boolean,
): { phase: Phase; data: SavePhasePlanRequest }[] {
  return phases.flatMap((phase) => {
    const edit = edits[phase.id];
    if (!edit || !present(phase.id) || sameChoice(edit, storedChoice(phase, unitId))) return [];
    return [{ phase, data: mergedPlan(phase, unitId, edit) }];
  });
}

/**
 * The legend's colours, except relay: `--shf-amber-deep` is the amber that
 * reads on the paper the picture is drawn on, and on the wizard's dark surface
 * it all but disappears, so the plain amber stands in for it.
 */
const ON_DARK = { ...PAIR_COLOR, relay: 'var(--shf-amber)' };

/**
 * A requirement's status as a glyph plus the detail that goes on hover.
 * The Must talk to chip row shows only the glyph, in a fixed-width slot, and
 * puts the detail in the tooltip and accessible name so the row never reflows
 * when a status appears or changes; the review still writes the sentence with `statusText`.
 */
export function statusGlyph(s: PairStatus, labelOf: (participantId: string) => string): { glyph: string; detail: string; color: string; kind: PairStatus['status'] } {
  switch (s.status) {
    case 'direct': return { glyph: PAIR_GLYPH.direct, detail: `Direct: ${s.means.join(', ')}`, color: ON_DARK.direct, kind: 'direct' };
    case 'relay': return { glyph: PAIR_GLYPH.relay, detail: `Relay through ${s.via.map(labelOf).join(', ')}`, color: ON_DARK.relay, kind: 'relay' };
    case 'cannot': return { glyph: PAIR_GLYPH.cannot, detail: 'No link', color: ON_DARK.cannot, kind: 'cannot' };
    case 'absent': return { glyph: '\u00b7', detail: 'Not in this phase', color: 'var(--shf-graphite-300)', kind: 'absent' };
  }
}

/** What a requirement is written as beside the unit it names, and in which colour. */
export function statusText(s: PairStatus, labelOf: (participantId: string) => string): { text: string; color: string } {
  switch (s.status) {
    case 'direct': return { text: `${PAIR_GLYPH.direct} ${s.means.join(', ')}`, color: ON_DARK.direct };
    case 'relay': return { text: `${PAIR_GLYPH.relay} via ${s.via.map(labelOf).join(', ')}`, color: ON_DARK.relay };
    case 'cannot': return { text: `${PAIR_GLYPH.cannot} no link`, color: ON_DARK.cannot };
    case 'absent': return { text: 'not in this phase', color: 'var(--shf-graphite-300)' };
  }
}
