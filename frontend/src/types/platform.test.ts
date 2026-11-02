import { describe, expect, it } from 'vitest';

import { PLATFORM_TYPES, platformTypeLabel } from './platform';

describe('PLATFORM_TYPES', () => {
  // Migration 050: uav sits between aircraft and ship, so the library's type
  // filter and the wizard's grouping keep the two kinds of airframe adjacent.
  it('lists uav after aircraft and before ship', () => {
    expect([...PLATFORM_TYPES]).toEqual(['aircraft', 'uav', 'ship', 'ground vehicle', 'ground station']);
  });
});

describe('platformTypeLabel', () => {
  it('capitalises a plain type', () => {
    expect(platformTypeLabel('ground vehicle')).toBe('Ground vehicle');
  });

  it('spells uav as the initialism', () => {
    expect(platformTypeLabel('uav')).toBe('UAV');
  });

  it('returns a blank unchanged', () => {
    expect(platformTypeLabel('')).toBe('');
  });
});
