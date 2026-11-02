/**
 * The matrix's URL state, read and written in one place so the page and its
 * print route cannot disagree about what a shared link means. URL state
 * because a matrix is something someone sends ("the USMC view with our two
 * radios and the F-35").
 *
 *   branch=USA,USMC       branch filter, any-of
 *   type=aircraft,ship    asset type filter, any-of (`radio` is the catalog radios)
 *   cols=<id>,<id>        column selection, in display order
 *   hideEmpty=1           drop rows no column carries
 *   fit=1                 Fit to one page, shared with the print preview - the
 *                         same key and meaning as the compare page's
 */

export interface MatrixParams {
  branches: string[];
  types: string[];
  selected: string[];
  omitEmptyRows: boolean;
  fit: boolean;
}

function list(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
}

export function readMatrixParams(sp: URLSearchParams): MatrixParams {
  return {
    branches: list(sp, 'branch'),
    types: list(sp, 'type'),
    selected: list(sp, 'cols'),
    omitEmptyRows: sp.get('hideEmpty') === '1',
    fit: sp.get('fit') === '1',
  };
}

/** A copy of `sp` with `patch` applied. Empty values leave the URL. */
export function writeMatrixParams(sp: URLSearchParams, patch: Partial<MatrixParams>): URLSearchParams {
  const next = new URLSearchParams(sp);
  const setList = (key: string, v: string[] | undefined) => {
    if (v === undefined) return;
    if (v.length === 0) next.delete(key);
    else next.set(key, v.join(','));
  };
  setList('branch', patch.branches);
  setList('type', patch.types);
  setList('cols', patch.selected);
  if (patch.omitEmptyRows !== undefined) {
    if (patch.omitEmptyRows) next.set('hideEmpty', '1');
    else next.delete('hideEmpty');
  }
  if (patch.fit !== undefined) {
    if (patch.fit) next.set('fit', '1');
    else next.delete('fit');
  }
  return next;
}
