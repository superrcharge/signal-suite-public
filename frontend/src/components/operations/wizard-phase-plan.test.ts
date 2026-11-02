import { describe, expect, it } from 'vitest';

import type { Participant, Phase } from '@/types';
import { changedPlans, mergedPlan, NO_CHOICE, presentInPhase, sameChoice, statusGlyph, statusText, storedChoice } from './wizard-phase-plan';

const phase = (over: Partial<Phase> = {}): Phase => ({
  id: 'ph1', operation_id: 'op', position: 1, name: 'Phase I',
  supported_participant_id: null, placements: {}, requirements: [], ...over,
});

describe('storedChoice', () => {
  it('reads the unit as either end of a pair, and its placement', () => {
    const ph = phase({
      placements: { me: 's1', other: 's2' },
      requirements: [{ id: 'r1', a: 'a', b: 'me' }, { id: 'r2', a: 'me', b: 'z' }, { id: 'r3', a: 'a', b: 'z' }],
    });
    expect(storedChoice(ph, 'me')).toEqual({ site: 's1', partners: ['a', 'z'] });
  });

  it('is nothing for a unit with no id yet, or no part in the phase', () => {
    expect(storedChoice(phase({ placements: { me: 's1' } }), undefined)).toEqual(NO_CHOICE);
    expect(storedChoice(phase(), 'me')).toEqual({ site: '', partners: [] });
  });
});

describe('sameChoice', () => {
  it('ignores the order and repeats of partners, and not the site', () => {
    expect(sameChoice({ site: 's', partners: ['a', 'b'] }, { site: 's', partners: ['b', 'a', 'a'] })).toBe(true);
    expect(sameChoice({ site: 's', partners: ['a'] }, { site: 't', partners: ['a'] })).toBe(false);
    expect(sameChoice({ site: 's', partners: ['a'] }, { site: 's', partners: ['a', 'b'] })).toBe(false);
  });
});

describe('mergedPlan', () => {
  const ph = phase({
    supported_participant_id: 'sup',
    placements: { me: 's1', other: 's2' },
    requirements: [{ id: 'r1', a: 'me', b: 'x' }, { id: 'r2', a: 'a', b: 'b' }],
  });

  it('keeps the supported unit, the others placements and the pairs that do not name the unit', () => {
    expect(mergedPlan(ph, 'me', { site: 's3', partners: [] })).toEqual({
      supported_participant_id: 'sup',
      placements: { me: 's3', other: 's2' },
      requirements: [{ a: 'a', b: 'b' }],
    });
  });

  it('removes the placement for no location', () => {
    expect(mergedPlan(ph, 'me', { site: '', partners: [] }).placements).toEqual({ other: 's2' });
  });

  it('writes each pair with the smaller id first whichever end the unit is, once, and never one with itself', () => {
    const out = mergedPlan(phase(), 'm', { site: '', partners: ['z', 'a', 'z', 'm'] });
    expect(out.requirements).toEqual([{ a: 'm', b: 'z' }, { a: 'a', b: 'm' }]);
  });
});

describe('changedPlans', () => {
  const p1 = phase({ id: 'ph1', placements: { me: 's1' } });
  const p2 = phase({ id: 'ph2', name: 'Phase II' });
  const p3 = phase({ id: 'ph3', name: 'Phase III' });
  const all = () => true;

  it('is one merged plan per phase whose part differs, in phase order, and none for a phase without an edit or with an edit equal to what is stored', () => {
    const out = changedPlans(
      [p1, p2, p3], 'me',
      { ph3: { site: 's2', partners: [] }, ph1: { site: 's1', partners: [] }, ph2: { site: '', partners: [] } },
      all,
    );
    expect(out.map((c) => c.phase.id)).toEqual(['ph3']);
    expect(out[0]?.data.placements).toEqual({ me: 's2' });
  });

  it('skips a phase the unit is not in, however it was edited', () => {
    const out = changedPlans([p1, p2], 'me', { ph1: { site: 's9', partners: [] }, ph2: { site: 's9', partners: [] } }, (id) => id === 'ph2');
    expect(out.map((c) => c.phase.id)).toEqual(['ph2']);
  });
});

describe('presentInPhase', () => {
  const unit = (over: Partial<Participant>) => ({
    platform_ids: [], equipment_ids: [], transport_ids: [], asset_phases: {}, ...over,
  }) as unknown as Participant;

  it('is any picked asset with the phase in its marks, and an unmarked asset is in every phase', () => {
    expect(presentInPhase(unit({ equipment_ids: ['e'] }), 'ph1')).toBe(true);
    expect(presentInPhase(unit({ equipment_ids: ['e'], asset_phases: { e: ['ph2'] } }), 'ph1')).toBe(false);
    expect(presentInPhase(unit({ equipment_ids: ['e'], transport_ids: ['t'], asset_phases: { e: ['ph2'], t: ['ph1'] } }), 'ph1')).toBe(true);
  });

  it('is false for a unit with nothing picked', () => {
    expect(presentInPhase(unit({}), 'ph1')).toBe(false);
  });
});

describe('statusText', () => {
  const labelOf = (id: string) => id.toUpperCase();

  it('writes each status the way the Web legend does, with its glyph', () => {
    expect(statusText({ status: 'direct', means: ['SRW', 'WGS'] }, labelOf).text).toBe('✓ SRW, WGS');
    expect(statusText({ status: 'relay', via: ['a', 'b'] }, labelOf).text).toBe('↻ via A, B');
    expect(statusText({ status: 'cannot' }, labelOf).text).toBe('✕ no link');
    expect(statusText({ status: 'absent', missing: ['x'] }, labelOf).text).toBe('not in this phase');
  });

  it('colours three of them from the legend tokens, relay in the amber that reads on dark, and mutes the absent one', () => {
    expect(statusText({ status: 'relay', via: ['a'] }, labelOf).color).toBe('var(--shf-amber)');
    expect(statusText({ status: 'cannot' }, labelOf).color).toBe('var(--shf-error)');
    expect(statusText({ status: 'absent', missing: [] }, labelOf).color).toBe('var(--shf-graphite-300)');
  });
});

describe('statusGlyph', () => {
  const labelOf = (id: string) => id.toUpperCase();

  it('gives a direct pair its check glyph, the means as detail, and the legend green', () => {
    const g = statusGlyph({ status: 'direct', means: ['SRW', 'WGS'] }, labelOf);
    expect(g).toEqual({ glyph: '✓', kind: 'direct', detail: 'Direct: SRW, WGS', color: statusText({ status: 'direct', means: [] }, labelOf).color });
  });

  it('gives a relay pair its glyph, the relay units as detail, and the amber that reads on dark', () => {
    expect(statusGlyph({ status: 'relay', via: ['a', 'b'] }, labelOf)).toEqual({ glyph: '↻', kind: 'relay', detail: 'Relay through A, B', color: 'var(--shf-amber)' });
  });

  it('gives a pair with no link its cross, "No link", and the error colour', () => {
    expect(statusGlyph({ status: 'cannot' }, labelOf)).toEqual({ glyph: '✕', kind: 'cannot', detail: 'No link', color: 'var(--shf-error)' });
  });

  it('gives an absent pair a middle dot, "Not in this phase", and the muted graphite', () => {
    expect(statusGlyph({ status: 'absent', missing: ['x'] }, labelOf)).toEqual({ glyph: '·', kind: 'absent', detail: 'Not in this phase', color: 'var(--shf-graphite-300)' });
  });
});
