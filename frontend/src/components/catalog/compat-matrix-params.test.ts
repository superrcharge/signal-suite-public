import { describe, expect, it } from 'vitest';

import { readMatrixParams, writeMatrixParams } from './compat-matrix-params';

// A shared link is the reason this is URL state, so what one page writes the
// print route has to read back identically.
describe('compat-matrix-params', () => {
  it('round-trips the branch and type filters, a type with a space included', () => {
    const sp = writeMatrixParams(new URLSearchParams(), {
      branches: ['USA', 'USMC'],
      types: ['aircraft', 'ground vehicle'],
    });

    expect(readMatrixParams(sp)).toMatchObject({
      branches: ['USA', 'USMC'],
      types: ['aircraft', 'ground vehicle'],
    });
  });

  it('drops an emptied filter from the URL and leaves the others alone', () => {
    const start = new URLSearchParams('branch=USA,USMC&type=ship&cols=p1,p2');
    const sp = writeMatrixParams(start, { branches: [] });

    expect(sp.has('branch')).toBe(false);
    expect(readMatrixParams(sp)).toEqual({
      branches: [],
      types: ['ship'],
      selected: ['p1', 'p2'],
      omitEmptyRows: false,
      fit: false,
    });
  });

  it('round-trips Fit, the key compare uses', () => {
    const on = writeMatrixParams(new URLSearchParams(), { fit: true });
    expect(on.get('fit')).toBe('1');
    expect(readMatrixParams(on).fit).toBe(true);
    expect(writeMatrixParams(on, { fit: false }).has('fit')).toBe(false);
  });

  // Links shared before migration 044 carry cat= and op=. Neither means
  // anything now, so they are ignored rather than half-applied.
  it('ignores the retired cat and op parameters', () => {
    const p = readMatrixParams(new URLSearchParams('cat=joint&op=USAF&type=ship'));
    expect(p).toEqual({ branches: [], types: ['ship'], selected: [], omitEmptyRows: false, fit: false });
  });
});
