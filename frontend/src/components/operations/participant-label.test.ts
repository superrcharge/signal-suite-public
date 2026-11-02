import { describe, expect, it } from 'vitest';

import type { Participant } from '@/types';
import { participantLabel, participantSubName } from './participant-label';

const row = (name: string, short_label: string) =>
  ({ organization: { key: '', name, short_label, branch: '', color: '', adhoc: false } }) as Participant;

describe('participantSubName', () => {
  it('is the full name when the short label abbreviates it', () => {
    expect(participantSubName(row('Task Force Kilo', 'TF KILO'))).toBe('Task Force Kilo');
  });

  it('is empty when the short label is the name in any case or spacing', () => {
    expect(participantSubName(row('Brown', 'BROWN'))).toBe('');
    expect(participantSubName(row(' brown ', 'Brown'))).toBe('');
  });

  it('is empty with no short label, where the label already is the name', () => {
    const p = row('Brown', '');
    expect(participantLabel(p)).toBe('Brown');
    expect(participantSubName(p)).toBe('');
  });
});
