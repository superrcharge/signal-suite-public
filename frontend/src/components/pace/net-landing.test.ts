import { describe, expect, it } from 'vitest';

import { netsLibraryPath } from './net-landing';

const params = (s: string) => new URLSearchParams(s);

describe('netsLibraryPath', () => {
  it('lands on the created squadron, JEM and CONUS by default', () => {
    expect(netsLibraryPath({ section: 'bsqd', radioType: 'both', theater: 'both' }, params('')))
      .toBe('/nets/bsqd?radio=jem');
  });

  it('keeps the current tab and theater for a net carried by both', () => {
    expect(netsLibraryPath({ section: 'asqd', radioType: 'both', theater: 'both' }, params('radio=mpu5&theater=oconus')))
      .toBe('/nets/asqd?radio=mpu5&theater=oconus');
  });

  it('moves to the MPU5 tab for an MPU5-only net', () => {
    expect(netsLibraryPath({ section: 'asqd', radioType: 'mpu5', theater: 'both' }, params('radio=jem')))
      .toBe('/nets/asqd?radio=mpu5');
  });

  it('moves to OCONUS for an OCONUS-only net', () => {
    expect(netsLibraryPath({ section: 'asqd', radioType: 'jem', theater: 'oconus' }, params('')))
      .toBe('/nets/asqd?radio=jem&theater=oconus');
  });

  it('drops the theater for a CONUS-only net created from OCONUS', () => {
    // CONUS is the default and stays out of the URL, the theater.ts convention.
    expect(netsLibraryPath({ section: 'asqd', radioType: 'jem', theater: 'conus' }, params('theater=oconus')))
      .toBe('/nets/asqd?radio=jem');
  });

  it('ignores drawer params from the page it was created on', () => {
    expect(netsLibraryPath({ section: 'asqd', radioType: 'jem', theater: 'conus' }, params('drawer=add&id=x')))
      .toBe('/nets/asqd?radio=jem');
  });
});
