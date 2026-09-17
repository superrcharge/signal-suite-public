import { describe, expect, it } from 'vitest';

import { fallbackPathFor, homePathFor } from './home-path';
import { ROLES } from '@/types/roles';

/**
 * Both functions exist because two places hardcoded a destination hidden from
 * the planner role: `/` redirected to /terminals, and the not-found button went
 * to /dashboard. A planner sent to either lands on a page with no nav entry.
 */
describe('home destinations', () => {
  it('sends a planner somewhere it can see', () => {
    expect(homePathFor('planner')).toBe('/pace');
    expect(fallbackPathFor('planner')).toBe('/pace');
  });

  it('leaves every other role where it was', () => {
    for (const role of ROLES.filter((r) => r !== 'planner')) {
      expect(homePathFor(role)).toBe('/terminals');
      expect(fallbackPathFor(role)).toBe('/dashboard');
    }
    // Null is pre-login or an unrecognised roles[0]; the old default is right.
    expect(homePathFor(null)).toBe('/terminals');
    expect(fallbackPathFor(null)).toBe('/dashboard');
  });

  it('never sends anyone to a path the planner nav hides', () => {
    // The guard that makes the two above mean something: if /pace were ever
    // hidden from a planner, this pins that the destination moved with it.
    expect(homePathFor('planner')).not.toBe('/terminals');
    expect(fallbackPathFor('planner')).not.toBe('/dashboard');
  });
});
