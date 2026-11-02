/**
 * The theater in the URL, for the card page, the editor, the print route and
 * the nets library.
 *
 * `?theater=oconus` names the OCONUS card; CONUS is the default and is deleted
 * from the URL rather than written, the same asymmetry the comms library's
 * `?lib=` uses. A link that says nothing means the card everyone had before
 * theaters existed.
 *
 * Pure, so it is asserted directly rather than through a rendered page, and a
 * separate module because react-refresh forbids a non-component export from a
 * module that holds a component.
 */
import type { PaceTheater } from '@/types';

export const THEATER_PARAM = 'theater';

/** 'oconus' is OCONUS; anything else, including nothing, is CONUS. */
export function parseTheater(value: string | null | undefined): PaceTheater {
  return value === 'oconus' ? 'oconus' : 'conus';
}

/** A copy of `params` naming `theater`, with the default omitted. */
export function withTheater(params: URLSearchParams, theater: PaceTheater): URLSearchParams {
  const next = new URLSearchParams(params);
  if (theater === 'conus') next.delete(THEATER_PARAM);
  else next.set(THEATER_PARAM, theater);
  return next;
}

/** The whole query string for a link that carries nothing else. */
export function theaterQuery(theater: PaceTheater): '' | '?theater=oconus' {
  return theater === 'conus' ? '' : '?theater=oconus';
}

/** The theater appended to a link that already has, or may have, a query. */
export function theaterSuffix(theater: PaceTheater, joiner: '?' | '&'): string {
  return theater === 'conus' ? '' : `${joiner}theater=oconus`;
}
