import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './api-client';
import { queryKeys } from './query-client';
import type { CsvImportResult } from '@/components/common/csv/csv-import-result-dialog';

/**
 * Which query namespace an import invalidates. Separate from the CSV domain
 * registry because that file is deliberately free of anything importing from
 * `@/services`, which would make it un-mockable in a component test.
 */
const INVALIDATES: Record<string, keyof typeof queryKeys> = {
  terminals: 'terminals',
  kits: 'kits',
  equipment: 'equipment',
  waveforms: 'waveforms',
  services: 'services',
  transports: 'transports',
  nets: 'nets',
};

/**
 * One mutation for every importable domain.
 *
 * The path is passed in rather than derived here, because nets carry `:section`
 * and only the caller knows which squadron it is looking at.
 *
 * A single useMutation regardless of resource, so there is no rules-of-hooks
 * hazard and no seven-hooks-per-render waste. It replaces useImportTerminals and
 * useImportKits, which were identical apart from their URL.
 */
export function useCsvImport(resource: string, path: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (csv: string) => apiClient.post<CsvImportResult>(path, { csv }),
    onSuccess: () => {
      const namespace = INVALIDATES[resource];
      if (namespace) {
        void queryClient.invalidateQueries({ queryKey: queryKeys[namespace].all });
      }
    },
  });
}
