import type { Show } from './phase-show';

/**
 * The query string that carries the screen's choices to the print route, which
 * is a page of its own with no storage of this viewer's to read them from:
 * `?show=gaps&focus=<participant id>&phase=<phase id>`.
 *
 * `phase` is the phase on screen, which Focus needs: with no `focus` the screen
 * puts Focus on the supported or busiest unit of that phase, and the print
 * route has to land on the same unit.
 */
export interface PrintParams {
  show: Show;
  focus: string | null;
  phase: string | null;
}

/** The route's path and query, in the one spelling both ends use. */
export function printHref(operationId: string, { show, focus, phase }: PrintParams): string {
  const query = new URLSearchParams({ show });
  if (focus !== null) query.set('focus', focus);
  if (phase !== null) query.set('phase', phase);
  return `/operations/${operationId}/print?${query.toString()}`;
}

/** What `printHref` wrote; anything else reads as All, with no unit and no phase on screen. */
export function readPrintParams(search: URLSearchParams): PrintParams {
  const show = search.get('show');
  return {
    show: show === 'gaps' || show === 'focus' ? show : 'all',
    focus: search.get('focus'),
    phase: search.get('phase'),
  };
}

/**
 * The Matrix print route's path and query: `?phase=<phase id>` when a phase
 * was on screen, which is only where Back returns to. What prints is chosen on
 * the route itself, from its own phase chips (`?only=`), since Matrix has no
 * Show mode or focused unit to carry.
 */
export function matrixPrintHref(operationId: string, { phase }: { phase: string | null }): string {
  const base = `/operations/${operationId}/matrix/print`;
  return phase === null ? base : `${base}?${new URLSearchParams({ phase }).toString()}`;
}
