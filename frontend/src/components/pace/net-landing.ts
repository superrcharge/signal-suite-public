/**
 * Where the app lands after a net is created: that squadron's Nets Library,
 * on the radio tab and in the theater the new net is visible under.
 *
 * A net created and then nowhere on screen reads as one that was lost. Two
 * ways that happened: the drawer filed it under another squadron, or gave it
 * a radio or theater the list on screen was filtering out (MPU5-only from the
 * JEM tab, OCONUS-only from CONUS). A `both` value is visible under either,
 * so those keep whatever the current query says.
 *
 * Pure, so the header's drawer and the nets page's drawer land identically
 * and the rule is asserted directly rather than through a rendered page.
 */
import type { NetRadioType, NetTheater } from '@/types';

import { parseTheater, theaterSuffix } from './theater';

/** What the drawer reports about a net it just created. */
export interface NetCreated {
  section: string;
  radioType: NetRadioType;
  theater: NetTheater;
}

export function netsLibraryPath(created: NetCreated, current: URLSearchParams): string {
  const currentRadio = current.get('radio') === 'mpu5' ? 'mpu5' : 'jem';
  const radio = created.radioType === 'both' ? currentRadio : created.radioType;
  const theater = created.theater === 'both' ? parseTheater(current.get('theater')) : created.theater;
  return `/nets/${created.section}?radio=${radio}${theaterSuffix(theater, '&')}`;
}
