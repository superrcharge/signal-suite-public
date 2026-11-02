import { useMemo } from 'react';

import { useOperation } from '@/services';
import type { Participant, Phase, Site } from '@/types';
import { buildInterop } from './interop-model';
import { participantLabel } from './participant-label';
import { pairStatus } from './phase-plan-model';
import type { PairStatus } from './phase-plan-model';
import { useInteropInput } from './use-interop-input';
import { presentInPhase, statusGlyph, statusText, storedChoice } from './wizard-phase-plan';
import type { PhaseChoice } from './wizard-phase-plan';

/** The id the draft unit goes by until the server has given a new join its own. */
export const DRAFT_UNIT_ID = 'wizard-draft';

/** One phase as the Phases step and the review show it. */
export interface PhaseRow {
  phase: Phase;
  /** Whether the draft unit has any asset in the phase. A row it is not in is shown muted and sends nothing. */
  present: boolean;
  /** What is shown: the edit when there is one, else what is stored. A phase the unit is not in shows what is stored. */
  choice: PhaseChoice;
  /** Partner id to how the pair stands in this phase, for each unit in `choice.partners`. */
  statuses: Map<string, { text: string; color: string; glyph: string; detail: string; kind: PairStatus['status'] }>;
}

/**
 * The operation's phases, sites and other units from the query the page has
 * already filled, and one row per phase for the draft unit. The statuses are
 * the Web view's own `pairStatus` over `buildInterop`, run with the draft in
 * place of the unit's stored row, so they move as gear is picked or marked in
 * the steps before the Phases step.
 */
export function usePhaseRows({ operationId, unit, edits }: {
  operationId: string;
  /** The wizard's draft as a participant: its picked ids and phase marks are what count. */
  unit: Participant;
  /** The phases the user has changed, by phase id. */
  edits: Record<string, PhaseChoice>;
}): { loaded: boolean; sites: Site[]; others: Participant[]; rows: PhaseRow[] } {
  const { data } = useOperation(operationId);

  const roster = useMemo(() => {
    const stored = data?.participants ?? [];
    return stored.some((p) => p.id === unit.id) ? stored.map((p) => (p.id === unit.id ? unit : p)) : [...stored, unit];
  }, [data, unit]);
  const { input } = useInteropInput(roster);

  const rows = useMemo(() => {
    const labels = new Map(roster.map((p) => [p.id, participantLabel(p)]));
    const labelOf = (id: string) => labels.get(id) ?? id;
    return (data?.phases ?? []).map((phase): PhaseRow => {
      const stored = storedChoice(phase, unit.id === DRAFT_UNIT_ID ? undefined : unit.id);
      const present = presentInPhase(unit, phase.id);
      const choice = present ? edits[phase.id] ?? stored : stored;
      const model = present ? buildInterop({ ...input, phaseId: phase.id }) : undefined;
      const statuses = new Map(
        model
          ? choice.partners.map((id) => {
            const st = pairStatus(model, unit.id, id);
            const { glyph, detail, kind } = statusGlyph(st, labelOf);
            return [id, { ...statusText(st, labelOf), glyph, detail, kind }] as const;
          })
          : [],
      );
      return { phase, present, choice, statuses };
    });
  }, [data, roster, input, unit, edits]);

  return {
    loaded: data !== undefined,
    sites: data?.sites ?? [],
    others: roster.filter((p) => p.id !== unit.id),
    rows,
  };
}
