import type { Equipment } from '@/types';
import {
  COMPARE_GROUPS,
  DEFAULT_PARAM_IDS,
  type CompareGroup,
  type CompareParam,
  paramIsVisible,
  paramsForSelection,
} from './compare-params';

/**
 * Turning two URL parameters into a matrix, as a pure function.
 *
 * This is the `csv-selection.ts` shape: the decision about what a request
 * means lives away from the component that renders it, so it is unit tested
 * rather than asserted by mounting a page. The rules here are all about
 * tolerating a URL that has gone stale, and none of them is visible from a
 * screenshot.
 */

/** Column order is the order the ids appear in, so the reader controls it. */
export const IDS_PARAM = 'ids';
export const PARAMS_PARAM = 'params';
/** "Fit to one page": shared between the live page and the print preview, so
 *  a reader who turns it on in one place sees the same choice reflected in
 *  the other rather than two independent toggles that can disagree. */
export const FIT_PARAM = 'fit';

const SEPARATOR = ',';

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(SEPARATOR)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * The equipment named by `?ids=`, in the order named, with anything the
 * catalog does not hold dropped.
 *
 * Dropped rather than reported, because the case this exists for is a
 * bookmark that outlived a deleted record. An error screen there teaches the
 * reader nothing they can act on; a matrix of the records that do still exist
 * is the useful answer. The page rewrites the URL afterwards so the stale id
 * does not come back on the next reload.
 */
export function resolveSelection(rawIds: string | null, catalog: Equipment[]): Equipment[] {
  const byId = new Map(catalog.map(eq => [eq.id, eq]));
  return splitList(rawIds)
    .map(id => byId.get(id))
    .filter((eq): eq is Equipment => eq !== undefined);
}

/**
 * The ids the reader chose, before anything is hidden.
 *
 * This is what gets written back to the URL, and keeping it separate from
 * what is drawn is the whole point. `resolveParams` drops a row that applies
 * to no selected terminal type, which is right for rendering and catastrophic
 * for persistence: deselecting the last radio would write back a list with
 * every radio-only row missing, so re-adding the radio would come back with
 * the reader's choices silently gone. Visibility is derived, never
 * destructive.
 */
export function resolveChosenIds(rawParams: string | null): string[] {
  return rawParams === null ? [...DEFAULT_PARAM_IDS] : splitList(rawParams);
}

/**
 * The parameters to draw: those the reader chose that also exist and apply
 * for this selection.
 *
 * An absent parameter means the default set, so a bare
 * `/catalog/compare?ids=a,b` stays short enough to paste into a chat. An
 * explicitly empty one means the reader unticked everything, which is a state
 * they are allowed to be in and is not the same as not having chosen.
 *
 * Never write the result of this back to the URL. See resolveChosenIds.
 */
export function resolveParams(rawParams: string | null, selection: Equipment[]): CompareParam[] {
  const available = paramsForSelection(selection);
  const byId = new Map(available.map(p => [p.id, p]));

  const wanted = rawParams === null ? DEFAULT_PARAM_IDS : splitList(rawParams);

  return wanted
    .map(id => byId.get(id))
    .filter((p): p is CompareParam => p !== undefined)
    .filter(p => paramIsVisible(p, selection));
}

export interface CompareRowGroup {
  group: CompareGroup;
  params: CompareParam[];
}

/**
 * Chosen parameters, bucketed into the datasheet's section order.
 *
 * A group with nothing in it is omitted rather than rendered as an empty
 * heading, since the reader unticking a whole group should remove the group.
 */
export function groupRows(params: CompareParam[]): CompareRowGroup[] {
  return COMPARE_GROUPS.map(group => ({
    group,
    params: params.filter(p => p.group === group),
  })).filter(g => g.params.length > 0);
}

/**
 * What `?params=` should say, given what the reader ticked.
 *
 * Returns null when the ticked set is exactly the default, so the common case
 * leaves the URL clean instead of spelling out sixteen ids. The asymmetry with
 * an empty selection is deliberate and is the reason this is not just a join:
 * an empty string has to survive, or unticking everything would silently
 * restore the defaults on the next read.
 */
export function encodeParams(ids: string[]): string | null {
  if (ids.length === DEFAULT_PARAM_IDS.length && DEFAULT_PARAM_IDS.every(id => ids.includes(id))) {
    return null;
  }
  return ids.join(SEPARATOR);
}

export function encodeIds(ids: string[]): string | null {
  return ids.length > 0 ? ids.join(SEPARATOR) : null;
}

/**
 * Did the URL name something the catalog no longer holds?
 *
 * The page uses this to decide whether to rewrite the URL, and rewriting
 * unconditionally would be a redirect loop.
 */
export function hasStaleIds(rawIds: string | null, resolved: Equipment[]): boolean {
  // Counted before deduplication on purpose. `splitList` drops a repeated id,
  // so comparing against its output would call `?ids=a,a` clean and leave the
  // duplicate in the URL for good.
  if (!rawIds) return resolved.length > 0;
  const segments = rawIds.split(SEPARATOR).filter(part => part.trim() !== '');
  return segments.length !== resolved.length;
}
