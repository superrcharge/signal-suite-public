/**
 * The matrix's URL state, read and written in one place so the page and its
 * print route cannot disagree about what a shared link means. URL state
 * because a matrix is something someone sends ("the JOINT view with our two
 * radios and the F-35").
 *
 *   cat=joint,coalition   category filter
 *   cols=<id>,<id>        column selection, in display order
 *   hideEmpty=1           drop rows no column carries
 */

export interface MatrixParams {
  categories: string[];
  selected: string[];
  omitEmptyRows: boolean;
}

function list(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
}

export function readMatrixParams(sp: URLSearchParams): MatrixParams {
  return {
    categories: list(sp, 'cat'),
    selected: list(sp, 'cols'),
    omitEmptyRows: sp.get('hideEmpty') === '1',
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
  setList('cat', patch.categories);
  setList('cols', patch.selected);
  if (patch.omitEmptyRows !== undefined) {
    if (patch.omitEmptyRows) next.set('hideEmpty', '1');
    else next.delete('hideEmpty');
  }
  return next;
}
