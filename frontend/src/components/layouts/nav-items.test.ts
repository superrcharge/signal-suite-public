import { describe, expect, it } from 'vitest';

import { visibleNavItems } from './nav-items';

const labels = (flags: Parameters<typeof visibleNavItems>[0]) =>
  visibleNavItems(flags).map((n) => n.label);

describe('visibleNavItems', () => {
  it('offers an admin every page, in order', () => {
    expect(labels({ isAdmin: true, canSeeContracts: true, canSeeTrackers: true, isPlanner: false })).toEqual([
      'Dashboard', 'Stats', 'Terminals', 'Kits', 'Catalog', 'PACE', 'Operations',
      'Contracts', 'Users', 'Settings',
    ]);
  });

  it('withholds Users from an editor', () => {
    expect(labels({ isAdmin: false, canSeeContracts: true, canSeeTrackers: true, isPlanner: false })).toEqual([
      'Dashboard', 'Stats', 'Terminals', 'Kits', 'Catalog', 'PACE', 'Operations',
      'Contracts', 'Settings',
    ]);
  });

  it('withholds the trackers, Contracts and Users from a viewer or rto', () => {
    expect(labels({ isAdmin: false, canSeeContracts: false, canSeeTrackers: false, isPlanner: false })).toEqual([
      'Dashboard', 'Stats', 'Catalog', 'PACE', 'Operations', 'Settings',
    ]);
  });

  it('shapes the planner list: Dashboard and Stats stay, the Terminals and Kits trackers go', () => {
    expect(labels({ isAdmin: false, canSeeContracts: false, canSeeTrackers: false, isPlanner: true })).toEqual([
      'Dashboard', 'Stats', 'Catalog', 'PACE', 'Operations', 'Settings',
    ]);
  });
});
