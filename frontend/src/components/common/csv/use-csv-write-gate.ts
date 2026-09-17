import { useMemo } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { CSV_DOMAINS, type CsvResource } from './csv-domains';

/**
 * The one reading of `writeGate`.
 *
 * `csv-domains.ts` is the single registry of CSV datasets and every entry
 * carries the flag its import route sits behind. It used to have two consumers
 * that disagreed: `csv-toolbar.tsx` read `writeGate`, and `csv-import-dialog.tsx`
 * filtered on `importPath` alone. So the header Import control - which opens on
 * any write gate at all, on every route - offered a planner Terminals, Kits,
 * Services, Equipment and Waveforms, every one of which answers 403, while the
 * Settings catalogue correctly hid the same datasets from the same user.
 *
 * A predicate rather than a boolean, because one consumer is locked to a single
 * domain and the other is dataset-agnostic. Both ask the same question of the
 * same registry, which is the property that was missing.
 *
 * Memoised on the three flags: the header dialog filters inside a `useMemo`
 * keyed on this function, so a fresh identity every render would defeat it.
 */
export function useCsvWriteGate(): (resource: CsvResource) => boolean {
  const { canWrite, canWriteRadio, canWritePace } = useAuth();

  return useMemo(() => {
    const gates = { canWrite, canWriteRadio, canWritePace };
    return (resource: CsvResource) => gates[CSV_DOMAINS[resource].writeGate];
  }, [canWrite, canWriteRadio, canWritePace]);
}
