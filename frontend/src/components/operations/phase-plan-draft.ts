import { useCallback, useMemo, useState } from 'react';

import type { Phase, SavePhasePlanRequest } from '@/types';

/** One phase's plan as being edited: the three things the planning panel changes. */
export interface PlanDraft {
  supported: string | null;
  /** Participant id to site id. Units not in the phase are carried through untouched. */
  placements: Record<string, string>;
  requirements: { a: string; b: string }[];
}

const EMPTY_DRAFT: PlanDraft = { supported: null, placements: {}, requirements: [] };

export const draftOf = (phase: Phase): PlanDraft => ({
  supported: phase.supported_participant_id,
  placements: { ...phase.placements },
  requirements: phase.requirements.map(({ a, b }) => ({ a, b })),
});

/** A pair means the same either way round; the server keeps it with `a` first. */
export const normalisePair = (a: string, b: string) => (a < b ? { a, b } : { a: b, b: a });

const pairKey = (r: { a: string; b: string }) => {
  const { a, b } = normalisePair(r.a, r.b);
  return `${a}|${b}`;
};

/** Whether two drafts say the same thing: order of placements and of requirements does not matter. */
export function sameDraft(x: PlanDraft, y: PlanDraft): boolean {
  if (x.supported !== y.supported) return false;
  const px = Object.entries(x.placements);
  if (px.length !== Object.keys(y.placements).length || px.some(([k, v]) => y.placements[k] !== v)) return false;
  const rx = x.requirements.map(pairKey).sort();
  const ry = y.requirements.map(pairKey).sort();
  return rx.length === ry.length && rx.every((k, i) => k === ry[i]);
}

/** The phase as the draft would make it, so the picture can show an edit before it is saved. */
export const draftPhase = (phase: Phase, d: PlanDraft): Phase => ({
  ...phase,
  supported_participant_id: d.supported,
  placements: d.placements,
  requirements: d.requirements.map((r, i) => ({ id: `draft-${String(i)}`, ...r })),
});

export const planRequest = (d: PlanDraft): SavePhasePlanRequest => ({
  supported_participant_id: d.supported,
  placements: d.placements,
  requirements: d.requirements.map(({ a, b }) => ({ a, b })),
});

/**
 * The draft of the chosen phase's plan, kept above the panel and the picture
 * so the phase switch can ask before a dirty draft is thrown away. It starts
 * from the phase, and follows the phase when the server sends it again: a
 * different phase always replaces it, the same phase replaces it only while
 * the draft is clean, so a refetch never discards what is being typed.
 */
export function usePhasePlanDraft(phase: Phase | undefined) {
  const base = useMemo(() => (phase ? draftOf(phase) : EMPTY_DRAFT), [phase]);
  const [state, setState] = useState({ phaseId: phase?.id, base, draft: base });
  if (state.base !== base) {
    const clean = sameDraft(state.draft, state.base);
    setState({ phaseId: phase?.id, base, draft: clean || state.phaseId !== phase?.id ? base : state.draft });
  }
  const setDraft = useCallback((change: (d: PlanDraft) => PlanDraft) => {
    setState((s) => ({ ...s, draft: change(s.draft) }));
  }, []);
  const reset = useCallback(() => { setState((s) => ({ ...s, draft: s.base })); }, []);
  return { draft: state.draft, setDraft, reset, dirty: !sameDraft(state.draft, state.base) };
}
