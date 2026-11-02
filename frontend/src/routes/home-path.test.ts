import { describe, expect, it } from 'vitest';

import { fallbackPathFor, homePathFor } from './home-path';
import { ROLES } from '@/types/roles';

/**
 * Both functions exist because two places hardcoded a destination hidden from
 * the planner role. Home is now the Dashboard for every role, planner included,
 * since the Dashboard is in every role's nav.
 */
describe('home destinations', () => {
  it('sends every role to the dashboard', () => {
    for (const role of ROLES) {
      expect(homePathFor(role)).toBe('/dashboard');
      expect(fallbackPathFor(role)).toBe('/dashboard');
    }
    // Null is pre-login or an unrecognised roles[0]; the same front door is right.
    expect(homePathFor(null)).toBe('/dashboard');
    expect(fallbackPathFor(null)).toBe('/dashboard');
  });

  it('includes the planner, which no longer has a separate home', () => {
    expect(homePathFor('planner')).toBe('/dashboard');
    expect(fallbackPathFor('planner')).toBe('/dashboard');
  });
});
