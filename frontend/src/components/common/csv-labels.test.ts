import { describe, expect, it } from 'vitest';

import { CSV_COLUMNS } from '@/generated/csv-columns';
import { columnsFor, hasExplicitLabel, labelFor } from './csv-labels';

describe('csv column labels', () => {
  it('has a label written for every generated column key', () => {
    // The one thing splitting membership (generated) from copy (hand-written)
    // can still get wrong: a new backend column arrives with no label and falls
    // through to a humanised guess. Cosmetic rather than broken, which is why it
    // is a test and not a runtime error, but it should never ship.
    //
    // Checked via hasExplicitLabel, not by comparing the rendered text: plenty
    // of correct labels (Owner Email) are exactly what humanise() produces, so
    // comparing strings cannot tell a real entry from a fallback.
    const missing: string[] = [];
    for (const domain of CSV_COLUMNS) {
      for (const column of domain.columns) {
        if (!hasExplicitLabel(domain.resource, column.key)) {
          missing.push(`${domain.resource}.${column.key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('orders columns exactly as the backend emits them', () => {
    for (const domain of CSV_COLUMNS) {
      const keys = columnsFor(domain.resource).map((c) => c.key);
      expect(keys).toEqual(domain.columns.map((c) => c.key));
    }
  });

  it('exports id first, on every domain that has one', () => {
    // Not every domain does. A PACE channel row is identified by its plan and
    // its position on the wheel, not by a column, so it has no id to export -
    // and inventing one would imply a handle the API does not offer.
    for (const domain of CSV_COLUMNS) {
      const idIndex = domain.columns.findIndex((c) => c.key === 'id');
      if (idIndex === -1) continue;
      expect(idIndex, `${domain.resource} exports id but not first`).toBe(0);
    }
  });

  it('gives every importable domain something a person can fill in', () => {
    for (const domain of CSV_COLUMNS) {
      if (!domain.import) continue;
      const templatable = domain.columns.filter((c) => c.templatable);
      expect(templatable.length, `${domain.resource} has no templatable column`).toBeGreaterThan(0);
    }
  });

  it('marks the export-only domains as such', () => {
    // Contracts and PACE are export-only by decision: contracts because there
    // has never been a batch of them to load, PACE because a channel row is
    // meaningless without a plan and a net that already exist.
    const exportOnly = CSV_COLUMNS.filter((d) => !d.import).map((d) => d.resource);
    expect(exportOnly.sort()).toEqual(['contracts', 'pace-channels']);
  });

  it('gives the same key different copy where the domain needs it', () => {
    expect(labelFor('terminals', 'name')).toBe('Terminal Name');
    expect(labelFor('kits', 'name')).toBe('Kit Name');
  });

  it('refuses an unknown resource rather than rendering nothing', () => {
    expect(() => columnsFor('nope')).toThrow(/no CSV columns generated/);
  });
});
