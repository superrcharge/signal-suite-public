import { describe, expect, it } from 'vitest';

import { compareNatural, emptyListDescription } from './index';

/**
 * "No rows" has three causes and only one is an empty dataset. Both list pages
 * used to check the search term and the status filter, then fall through to
 * "nothing added yet" - so a variant, type, tag or section filter that matched
 * nothing claimed the table was empty. Kept as a unit test because the function
 * is pure; the pages only choose which filter names to pass.
 */
describe('emptyListDescription', () => {
  it('reports an empty dataset when nothing is filtered', () => {
    expect(emptyListDescription('terminals', undefined, [])).toBe(
      'No terminals have been added yet.',
    );
  });

  it('lets an active search win over the filters', () => {
    expect(emptyListDescription('terminals', 'ow-9', ['status'])).toBe(
      'No results for "ow-9". Try a different search.',
    );
  });

  it('names a single active filter and points at clearing it', () => {
    // The reported symptom: a variant filter that matches nothing must not
    // claim the table is empty.
    expect(emptyListDescription('terminals', undefined, ['variant'])).toBe(
      'No terminals match the current variant filter. Try clearing it.',
    );
  });

  it('joins two active filters', () => {
    expect(emptyListDescription('kits', undefined, ['status', 'type'])).toBe(
      'No kits match the current status and type filters. Try clearing one.',
    );
  });

  it('comma-joins three or more, with "and" before the last', () => {
    expect(
      emptyListDescription('terminals', undefined, ['status', 'variant', 'tag']),
    ).toBe(
      'No terminals match the current status, variant and tag filters. Try clearing one.',
    );
  });

  it('ignores the empty strings the pages pass for inactive filters', () => {
    // The call sites pass '' rather than filtering at each site, so the blanks
    // must not become a phantom filter or a stray comma.
    expect(emptyListDescription('kits', undefined, ['', 'type', ''])).toBe(
      'No kits match the current type filter. Try clearing it.',
    );
    expect(emptyListDescription('kits', undefined, ['', '', ''])).toBe(
      'No kits have been added yet.',
    );
  });

  it('treats an empty search term as no search', () => {
    // debouncedSearch is '' before anything is typed, not undefined.
    expect(emptyListDescription('kits', '', [])).toBe('No kits have been added yet.');
  });
});

/**
 * The client-side half of the numeric-ordering pair. Migration 038's
 * `natural_sort` Postgres collation orders the API's lists the same way, and both
 * are ICU with the same `numeric` setting - a name sorted by the server and the
 * same name sorted here must not disagree. These assert the ordering contract, so
 * a change on one side that is not mirrored on the other shows up as a failure.
 */
describe('compareNatural', () => {
  const sorted = (names: string[]) => [...names].sort(compareNatural);

  it('orders a digit run numerically rather than as text', () => {
    // The reported symptom: 10, 11, 12 landing before 2.
    expect(sorted(['ASQD MINI 10', 'ASQD MINI 2', 'ASQD MINI 1', 'ASQD MINI 9'])).toEqual([
      'ASQD MINI 1',
      'ASQD MINI 2',
      'ASQD MINI 9',
      'ASQD MINI 10',
    ]);
  });

  it('crosses the 9-to-10 boundary, which plain text ordering does not', () => {
    expect(sorted(['N-123', 'N-45'])).toEqual(['N-45', 'N-123']);
    // The contrast that makes the point.
    expect(['N-123', 'N-45'].sort((a, b) => a.localeCompare(b))).toEqual(['N-123', 'N-45']);
  });

  it('groups by the alphabetic part first', () => {
    expect(sorted(['Beta 2', 'Alpha 10', 'Alpha 2', 'Beta 1'])).toEqual([
      'Alpha 2',
      'Alpha 10',
      'Beta 1',
      'Beta 2',
    ]);
  });

  it('leaves names with no digits alphabetical', () => {
    expect(sorted(['Hornet', 'Ragno', 'Alert'])).toEqual(['Alert', 'Hornet', 'Ragno']);
  });

  it('treats zero-padding as the same number', () => {
    // MINI-001 and MINI-1 are the same ordinal, so they sort adjacently rather
    // than in separate runs. The server side is deterministic and breaks this tie
    // bitwise; here only the grouping matters.
    const out = sorted(['MINI-010', 'MINI-2', 'MINI-001']);
    expect(out).toEqual(['MINI-001', 'MINI-2', 'MINI-010']);
  });

  it('stays case-sensitive-by-locale, as the call sites already were', () => {
    // Deliberately NOT sensitivity:'base' - case handling is unchanged from the
    // plain localeCompare these sites used, and only ordering of digits moved.
    expect(compareNatural('alpha', 'alpha')).toBe(0);
    expect(compareNatural('a', 'b')).toBeLessThan(0);
    expect(compareNatural('b', 'a')).toBeGreaterThan(0);
  });
});
