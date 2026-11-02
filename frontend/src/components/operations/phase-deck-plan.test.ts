import { describe, expect, it } from 'vitest';

import { DECK_INPUT, DECK_OPERATION, DECK_PARTICIPANTS, DECK_PHASES, DECK_SITES } from './phase-deck-fixtures';
import { planPhaseDeck } from './phase-deck-plan';
import type { Show } from './phase-show';

const plan = (show: Show, focusParam: string | null = null, currentPhaseId: string | null = 'ph1') => planPhaseDeck({
  operation: DECK_OPERATION, phases: DECK_PHASES, participants: DECK_PARTICIPANTS, input: DECK_INPUT,
  sites: DECK_SITES, show, focusParam, currentPhaseId,
});

describe('planPhaseDeck', () => {
  it.each<Show>(['all', 'gaps', 'focus'])('is one slide per phase in position order in %s', (show) => {
    expect(plan(show).slides.map((s) => s.phase.id)).toEqual(['ph1', 'ph2', 'ph3']);
  });

  it('titles each slide with the operation and the phase, since the slide stands alone', () => {
    expect(plan('all').slides.map((s) => s.title)).toEqual([
      'Night Owl - Staging', 'Night Owl - Infil', 'Night Owl - Exfil',
    ]);
  });

  it('carries the mode it was asked for to every slide', () => {
    expect(plan('gaps').show).toBe('gaps');
  });

  it('draws every phase from its own model, so a unit out of a phase is not a column there', () => {
    expect(plan('all').slides.map((s) => s.model.columns.map((c) => c.participantId))).toEqual([
      ['pa', 'pb', 'pc'], ['pa', 'pb', 'pc'], ['pa', 'pc'],
    ]);
  });

  it('names no missing unit outside Focus', () => {
    expect(plan('all', 'pb').slides.map((s) => s.missing)).toEqual([null, null, null]);
    expect(plan('gaps', 'pb').slides.map((s) => s.missing)).toEqual([null, null, null]);
  });

  it('Focus keeps the one unit for every phase, and the phase without it says so', () => {
    const p = plan('focus', 'pb');
    expect(p.focusId).toBe('pb');
    expect(p.slides.map((s) => s.missing)).toEqual([null, null, 'BRAVO']);
  });

  it('Focus with no ?focus= is the unit the screen would pick for the phase on screen, for every phase', () => {
    // Staging has no supported unit, and ALPHA is in both of its requirements, so it is the busiest.
    const p = plan('focus', null, 'ph1');
    expect(p.focusId).toBe('pa');
    expect(p.slides.every((s) => s.missing === null)).toBe(true);
  });

  it('Focus on a unit the phase on screen does not have falls back as the screen does', () => {
    // BRAVO is not in Exfil, which is on screen, so the screen shows its own pick there.
    const p = plan('focus', 'pb', 'ph3');
    expect(p.focusId).toBe('pa');
  });

  it('reads an unknown phase on screen as the first', () => {
    expect(plan('focus', null, 'gone').focusId).toBe('pa');
  });

  it('has no slides for an operation with no phases', () => {
    const p = planPhaseDeck({
      operation: DECK_OPERATION, phases: [], participants: DECK_PARTICIPANTS, input: DECK_INPUT,
      sites: DECK_SITES, show: 'focus', focusParam: null, currentPhaseId: null,
    });
    expect(p.slides).toEqual([]);
    expect(p.focusId).toBeNull();
  });
});
