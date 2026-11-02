import { describe, expect, it } from 'vitest';

import { keyFromName } from './organization-key';

describe('keyFromName', () => {
  it('joins words with underscores', () => {
    expect(keyFromName('Close Air Support')).toBe('close_air_support');
  });

  it('keeps digits and runs of punctuation become one underscore', () => {
    expect(keyFromName('O6 JOC')).toBe('o6_joc');
    expect(keyFromName('RC-135V Rivet Joint')).toBe('rc_135v_rivet_joint');
  });

  it('returns an empty string for nothing usable', () => {
    expect(keyFromName('')).toBe('');
    expect(keyFromName(' -- ')).toBe('');
  });

  it('cuts to 50 characters', () => {
    expect(keyFromName('a'.repeat(80))).toHaveLength(50);
  });
});
