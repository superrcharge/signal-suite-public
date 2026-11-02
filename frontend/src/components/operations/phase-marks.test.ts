import { describe, expect, it } from 'vitest';

import type { Phase } from '@/types';
import { nextPhaseName, phaseCaption, toRoman } from './phase-marks';

const phases = (...names: string[]): Phase[] => names.map((name, i) => ({
  id: `p${i}`, operation_id: 'op', position: i + 1, name, supported_participant_id: null, placements: {}, requirements: [],
}));
const caption = (all: Phase[], inIds: string[], style: 'list' | 'runs') =>
  phaseCaption(all, (id) => inIds.includes(id), style);

const ROMAN = phases('Phase I', 'Phase II', 'Phase III', 'Phase IV');

describe('phaseCaption', () => {
  it('says nothing for an asset in every phase', () => {
    expect(caption(ROMAN, ['p0', 'p1', 'p2', 'p3'], 'runs')).toBe('');
    expect(caption(ROMAN, ['p0', 'p1', 'p2', 'p3'], 'list')).toBe('');
  });

  it('says nothing when there is only one phase or none, whatever the asset is in', () => {
    expect(caption(phases('Phase I'), [], 'runs')).toBe('');
    expect(caption([], [], 'list')).toBe('');
  });

  it('says "No phase" for an asset in none', () => {
    expect(caption(ROMAN, [], 'runs')).toBe('No phase');
    expect(caption(ROMAN, [], 'list')).toBe('No phase');
  });

  it('collapses neighbours into a run without repeating the shared word', () => {
    expect(caption(ROMAN, ['p1', 'p2'], 'runs')).toBe('Phase II-III');
    expect(caption(ROMAN, ['p0', 'p2', 'p3'], 'runs')).toBe('Phase I, Phase III-IV');
    expect(caption(ROMAN, ['p0', 'p1', 'p2'], 'runs')).toBe('Phase I-III');
  });

  it('keeps both names when a run starts and ends on names with nothing in common', () => {
    expect(caption(phases('Alpha', 'Bravo', 'Charlie'), ['p0', 'p1'], 'runs')).toBe('Alpha-Bravo');
  });

  it('lists every phase outright, in the operation order, in list style', () => {
    expect(caption(ROMAN, ['p2', 'p1'], 'list')).toBe('Phase II, Phase III');
  });
});

describe('nextPhaseName', () => {
  it('continues the defaults in roman numerals', () => {
    expect(nextPhaseName([{ name: 'Phase I' }, { name: 'Phase II' }, { name: 'Phase III' }, { name: 'Phase IV' }])).toBe('Phase V');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(14)).toBe('XIV');
  });

  it('skips a name already in use, whatever its case', () => {
    expect(nextPhaseName([{ name: 'Phase I' }, { name: 'phase iii' }])).toBe('Phase IV');
  });
});
