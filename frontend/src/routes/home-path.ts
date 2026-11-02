import type { Role } from '@/types/roles';

/**
 * Where "home" is for a role: the Dashboard, for every role.
 *
 * The planner role used to be the exception. The `/` redirect went to
 * `/terminals` and the not-found button to `/dashboard`, both hidden from a
 * planner, so both were a bounce into a page it has no nav entry for. The
 * Dashboard is the tile grid of the nav and shows each role only what its nav
 * shows, so one destination now fits all of them.
 *
 * Still one function rather than a constant in each place, because a role that
 * needs a different front door is likelier than not.
 */
export function homePathFor(_role: Role | null): string {
  return '/dashboard';
}

/**
 * Where the not-found page's button goes. Separate from homePathFor because
 * "back to something useful" and "the app's front door" are different
 * questions that happen to have the same answer today.
 */
export function fallbackPathFor(_role: Role | null): string {
  return '/dashboard';
}
