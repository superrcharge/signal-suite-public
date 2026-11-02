/**
 * What each slide of the operation's phase deck is about, worked out from the
 * model alone: one slide per phase, in phase order, every one drawn in the Show
 * mode the screen is in.
 *
 * Pure, like `phase-plan-model.ts`: no React and no DOM, so the rule that a
 * deck has exactly one slide per phase is asserted here rather than through a
 * rendered picture.
 */

import type { Operation, Participant, Phase, Site } from '@/types';
import { buildInterop } from './interop-model';
import type { InteropInput, InteropModel } from './interop-model';
import { participantLabel } from './participant-label';
import { phaseRequirements } from './phase-plan-model';
import type { RequirementEntry } from './phase-plan-model';
import { focusOf } from './phase-show';
import type { Show } from './phase-show';

export interface DeckSlidePlan {
  phase: Phase;
  /** The slide stands alone, so it names both: the screen leaves the operation to the banner and the phase to the chip. */
  title: string;
  model: InteropModel;
  entries: RequirementEntry[];
  /** Focus only: the label of the focused unit when this phase does not have it, which makes this the "not in this phase" slide. */
  missing: string | null;
}

export interface DeckPlan {
  slides: DeckSlidePlan[];
  show: Show;
  /** Focus only: the unit every phase is drawn about, as the screen has it; null when the phase on screen has no units. */
  focusId: string | null;
}

/**
 * `focusParam` is `?focus=` and `currentPhaseId` the phase on screen: when the
 * URL names no unit the screen's Focus is the supported or busiest unit of that
 * phase, and the deck keeps that unit for every phase rather than choosing a
 * new one per slide.
 */
export function planPhaseDeck(args: {
  operation: Pick<Operation, 'name'>;
  phases: Phase[];
  participants: Participant[];
  input: Omit<InteropInput, 'phaseId'>;
  sites: Site[];
  show: Show;
  focusParam: string | null;
  currentPhaseId: string | null;
}): DeckPlan {
  const ordered = [...args.phases].sort((a, b) => a.position - b.position);
  const built = ordered.map((phase) => {
    const model = buildInterop({ ...args.input, phaseId: phase.id });
    return { phase, model, entries: phaseRequirements(phase, model, args.participants) };
  });

  const current = built.find((b) => b.phase.id === args.currentPhaseId) ?? built[0];
  const focusId = args.show === 'focus' && current
    ? focusOf(current.model, current.phase.supported_participant_id, current.entries, args.focusParam)
    : null;
  const focused = args.participants.find((p) => p.id === focusId);
  const focusLabel = focused ? participantLabel(focused) : (focusId ?? '');

  return {
    show: args.show,
    focusId,
    slides: built.map(({ phase, model, entries }) => ({
      phase,
      title: `${args.operation.name} - ${phase.name}`,
      model,
      entries,
      missing: focusId !== null && !model.columns.some((c) => c.participantId === focusId) ? focusLabel : null,
    })),
  };
}

/** The sheet each slide is captured from: 16:9 at this width is 900 tall, so a short phase fills the slide and a long one is fitted. */
export const DECK_SHEET_W = 1600;
export const DECK_SHEET_H = 900;
