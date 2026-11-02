import { describe, expect, it } from 'vitest';

import type { Participant, Phase } from '@/types';
import { column, model, row, source } from './interop-fixtures';
import { pairStatus, phaseRequirements } from './phase-plan-model';

const a = source('row-a', 'equipment', 'a1', 'A1');
const b = source('row-b', 'equipment', 'b1', 'B1');
const c = source('row-c', 'equipment', 'c1', 'C1');
const d = source('row-d', 'equipment', 'd1', 'D1');
const cols = (...keys: string[]) => keys.map((k) => column(k, '', '', []));

describe('pairStatus', () => {
  it('is direct when both units share a row, naming the means', () => {
    const m = model(cols('a', 'b'), [row('waveform', 'x', 'X', '', [[a], [b]])]);

    expect(pairStatus(m, 'row-a', 'row-b')).toEqual({ status: 'direct', means: ['X'] });
  });

  it('is symmetric: the same answer whichever unit is named first', () => {
    const m = model(cols('a', 'b'), [row('waveform', 'x', 'X', '', [[a], [b]])]);

    expect(pairStatus(m, 'row-b', 'row-a')).toEqual(pairStatus(m, 'row-a', 'row-b'));
  });

  it('lists only the rows both units hold, waveforms first, then services, then transports', () => {
    // The model lists rows in that order already; the pair keeps it and drops rows only one holds.
    const m = model(cols('a', 'b', 'c'), [
      row('waveform', 'w1', 'SINCGARS', '', [[a], [b], []]),
      row('waveform', 'w2', 'ANW2', '', [[a], [], [c]]),
      row('service', 's1', 'WGS', '', [[a], [b], []]),
      row('transport', 't1', 'Fibre 1', '', [[a], [b], [c]]),
    ]);

    expect(pairStatus(m, 'row-a', 'row-b')).toEqual({ status: 'direct', means: ['SINCGARS', 'WGS', 'Fibre 1'] });
  });

  it('is a relay through the one unit that shares a row with each, and names it', () => {
    // A shares X with B; B shares Y with C; A and C share nothing.
    const m = model(cols('a', 'b', 'c'), [
      row('waveform', 'x', 'X', '', [[a], [b], []]),
      row('waveform', 'y', 'Y', '', [[], [b], [c]]),
    ]);

    expect(pairStatus(m, 'row-a', 'row-c')).toEqual({ status: 'relay', via: ['row-b'] });
    expect(pairStatus(m, 'row-c', 'row-a')).toEqual({ status: 'relay', via: ['row-b'] });
  });

  it('lists every unit on a shortest path, in order from the first unit, both ends excluded', () => {
    // A - B - C - D in a line.
    const m = model(cols('a', 'b', 'c', 'd'), [
      row('waveform', 'x', 'X', '', [[a], [b], [], []]),
      row('waveform', 'y', 'Y', '', [[], [b], [c], []]),
      row('waveform', 'z', 'Z', '', [[], [], [c], [d]]),
    ]);

    expect(pairStatus(m, 'row-a', 'row-d')).toEqual({ status: 'relay', via: ['row-b', 'row-c'] });
    expect(pairStatus(m, 'row-d', 'row-a')).toEqual({ status: 'relay', via: ['row-c', 'row-b'] });
  });

  it('prefers the shorter of two routes', () => {
    // A reaches D through C directly (A-C-D) or through B and C (A-B-C-D): the first is the path.
    const m = model(cols('a', 'b', 'c', 'd'), [
      row('waveform', 'x', 'X', '', [[a], [b], [], []]),
      row('waveform', 'y', 'Y', '', [[a], [], [c], []]),
      row('waveform', 'z', 'Z', '', [[], [b], [c], []]),
      row('waveform', 'w', 'W', '', [[], [], [c], [d]]),
    ]);

    expect(pairStatus(m, 'row-a', 'row-d')).toEqual({ status: 'relay', via: ['row-c'] });
  });

  it('is cannot when both are in the phase and nothing links them, even through others', () => {
    // A and B share X; C and D share Y; the two pairs never meet.
    const m = model(cols('a', 'b', 'c', 'd'), [
      row('waveform', 'x', 'X', '', [[a], [b], [], []]),
      row('waveform', 'y', 'Y', '', [[], [], [c], [d]]),
    ]);

    expect(pairStatus(m, 'row-a', 'row-c')).toEqual({ status: 'cannot' });
  });

  it('is cannot for a unit that shares nothing with anyone', () => {
    const m = model(cols('a', 'b', 'c'), [row('waveform', 'x', 'X', '', [[a], [b], []])]);

    expect(pairStatus(m, 'row-a', 'row-c')).toEqual({ status: 'cannot' });
  });

  it('is absent, naming who, when a unit is not a column in the phase', () => {
    const m = model(cols('a', 'b'), [row('waveform', 'x', 'X', '', [[a], [b]])]);

    expect(pairStatus(m, 'row-a', 'row-z')).toEqual({ status: 'absent', missing: ['row-z'] });
    expect(pairStatus(m, 'row-y', 'row-b')).toEqual({ status: 'absent', missing: ['row-y'] });
    expect(pairStatus(m, 'row-y', 'row-z')).toEqual({ status: 'absent', missing: ['row-y', 'row-z'] });
  });

  it('is absent, not cannot, against an empty model', () => {
    expect(pairStatus(model([], []), 'row-a', 'row-b')).toEqual({ status: 'absent', missing: ['row-a', 'row-b'] });
  });
});

describe('phaseRequirements', () => {
  const unit = (key: string): Participant => ({
    id: `row-${key}`, operation_id: 'op-1', organization_key: key,
    organization: { key, name: key, short_label: key.toUpperCase(), branch: 'USA', color: '', adhoc: false },
    platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
    asset_phases: {}, poc_name: '', poc_phone: '', poc_email: '', notes: '',
    created_by: '', updated_by: '', created_at: '', updated_at: '',
  });
  const people = ['a', 'b', 'c', 'd', 'e'].map(unit);
  const phase = (pairs: [string, string][]): Phase => ({
    id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I',
    supported_participant_id: null, placements: {},
    requirements: pairs.map(([x, y], i) => ({ id: `r${String(i)}`, a: `row-${x}`, b: `row-${y}` })),
  });
  // A and B share X; B and C share Y; D is in the phase holding nothing in common; E is not in it.
  const m = model(cols('a', 'b', 'c', 'd'), [
    row('waveform', 'x', 'X', '', [[a], [b], [], []]),
    row('waveform', 'y', 'Y', '', [[], [b], [c], []]),
    row('waveform', 'z', 'Z', '', [[], [], [], [d]]),
  ]);

  it('gives one entry per requirement, in the phase order, with both units labelled', () => {
    const entries = phaseRequirements(phase([['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']]), m, people);

    expect(entries.map((e) => [e.id, e.aLabel, e.bLabel, e.status.status])).toEqual([
      ['r0', 'A', 'B', 'direct'],
      ['r1', 'A', 'C', 'relay'],
      ['r2', 'A', 'D', 'cannot'],
      ['r3', 'A', 'E', 'absent'],
    ]);
  });

  it('labels a unit it does not know by its id', () => {
    const entries = phaseRequirements(phase([['a', 'b']]), m, []);

    expect([entries[0]!.aLabel, entries[0]!.bLabel]).toEqual(['row-a', 'row-b']);
  });

  it('gives no entries for a phase with no requirements', () => {
    expect(phaseRequirements(phase([]), m, people)).toEqual([]);
  });
});
