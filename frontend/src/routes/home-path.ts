import type { Role } from '@/types/roles';

/**
 * Where "home" is for a role.
 *
 * Two places used to hardcode a destination the planner role must not be sent
 * to: the `/` redirect went to `/terminals`, and the not-found page's button
 * went to `/dashboard`. Both are hidden from a planner, so both were a bounce
 * into a page it has no nav entry for.
 *
 * One function rather than a conditional in each, because a third dead-end is
 * likelier than a change to either of these two.
 */
export function homePathFor(role: Role | null): string {
  return role === 'planner' ? '/pace' : '/terminals';
}

/**
 * Where the not-found page's button goes. Separate from homePathFor because
 * "back to something useful" and "the app's front door" are only the same for
 * roles that can see the dashboard.
 */
export function fallbackPathFor(role: Role | null): string {
  return role === 'planner' ? '/pace' : '/dashboard';
}
