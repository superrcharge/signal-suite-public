import { describe, expect, it } from 'vitest';

import { parseTheater, theaterQuery, theaterSuffix, withTheater } from './theater';

describe('parseTheater', () => {
  it('reads oconus and treats everything else as conus', () => {
    expect(parseTheater('oconus')).toBe('oconus');
    expect(parseTheater('conus')).toBe('conus');
    expect(parseTheater(null)).toBe('conus');
    expect(parseTheater(undefined)).toBe('conus');
    expect(parseTheater('OCONUS')).toBe('conus');
    expect(parseTheater('both')).toBe('conus');
  });
});

describe('withTheater', () => {
  it('writes oconus and deletes the default, keeping the other params', () => {
    const base = new URLSearchParams('radio=mpu5&theater=oconus');
    expect(withTheater(base, 'conus').toString()).toBe('radio=mpu5');
    expect(withTheater(new URLSearchParams('radio=mpu5'), 'oconus').toString()).toBe(
      'radio=mpu5&theater=oconus',
    );
  });

  it('returns a copy', () => {
    const base = new URLSearchParams('radio=jem');
    withTheater(base, 'oconus');
    expect(base.toString()).toBe('radio=jem');
  });
});

describe('theaterQuery and theaterSuffix', () => {
  it('are empty for the default', () => {
    expect(theaterQuery('conus')).toBe('');
    expect(theaterSuffix('conus', '?')).toBe('');
    expect(theaterSuffix('conus', '&')).toBe('');
  });

  it('name oconus with the joiner the link needs', () => {
    expect(theaterQuery('oconus')).toBe('?theater=oconus');
    expect(theaterSuffix('oconus', '?')).toBe('?theater=oconus');
    expect(theaterSuffix('oconus', '&')).toBe('&theater=oconus');
  });
});
