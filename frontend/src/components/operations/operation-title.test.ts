import { describe, expect, it } from 'vitest';

import { operationDisplayName, operationTitle } from './operation-title';

describe('operationTitle', () => {
  it('reads "Operation <acronym>" when an acronym is set', () => {
    expect(operationTitle({ name: 'Mountain Storm', acronym: 'OMS' })).toBe('OMS');
  });

  it('falls back to the full name when the acronym is blank', () => {
    expect(operationTitle({ name: 'Mountain Storm', acronym: '' })).toBe('Mountain Storm');
  });

  it('returns the acronym itself when one is set', () => {
    // The server upper-cases and caps the acronym; it does not prefix it,
    // so the prefix is this function's alone.
    expect(operationTitle({ name: 'Operation Avalanche', acronym: 'AV' })).toBe('AV');
  });
});

describe('operationDisplayName', () => {
  it('drops one leading word "Operation", whatever its case', () => {
    expect(operationDisplayName({ name: 'Operation Matrix Smoke' })).toBe('Matrix Smoke');
    expect(operationDisplayName({ name: 'OPERATION Avalanche' })).toBe('Avalanche');
    expect(operationDisplayName({ name: '  Operation   Avalanche  ' })).toBe('Avalanche');
  });

  it('returns a name without that word unchanged', () => {
    expect(operationDisplayName({ name: 'Matrix Smoke' })).toBe('Matrix Smoke');
    // The word is only dropped when it is a whole leading word.
    expect(operationDisplayName({ name: 'Operational Readiness' })).toBe('Operational Readiness');
    expect(operationDisplayName({ name: 'Operation' })).toBe('Operation');
  });
});
