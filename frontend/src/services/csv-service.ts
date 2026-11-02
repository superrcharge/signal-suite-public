import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiClientError } from './api-client';
import { queryKeys } from './query-client';
import { apiFetch } from '@/auth/api-client';
import type { CsvImportResult } from '@/components/common/csv/csv-import-result-dialog';
import type { ApiResponse } from '@/types';

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
  platforms: 'platforms',
  organizations: 'organizations',
  nets: 'nets',
};

/**
 * Posts a CSV body to an import endpoint.
 *
 * Not `apiClient.post`, for two reasons. The path comes from the CSV registry,
 * which holds full `/api/v1/...` paths because export, template and the
 * csv-coverage check all read them that way, and `apiClient` prefixes
 * `/api/v1` again. That sent every import to `/api/v1/api/v1/...` from v1.5.0
 * until this was split out, so no import from the UI ever reached a handler.
 *
 * And the import contract is not the generic one. When every row is rejected
 * the server answers 400 with the ordinary success envelope, carrying each
 * row's reasons, and `handleResponse` throws on any non-2xx before reading the
 * body. The one case where a user most needs the row list was the one case they
 * could not see it.
 */
export async function postCsvImport(path: string, csv: string): Promise<CsvImportResult> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  });

  const body = (await response.json().catch(() => null)) as ApiResponse<CsvImportResult> | null;

  if (body?.success && body.data) {
    return body.data;
  }
  if (body?.error) {
    throw ApiClientError.fromApiError(body.error, response.status);
  }
  // Not an API response at all: Fiber's plain-text 404, or an HTML page from
  // something in front of the app. Naming the status is what makes the report
  // useful to whoever it reaches.
  throw new ApiClientError(
    'IMPORT_HTTP_ERROR',
    `Import failed (HTTP ${response.status} ${response.statusText}). Please try again.`,
  );
}

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
    mutationFn: (csv: string) => postCsvImport(path, csv),
    onSuccess: () => {
      const namespace = INVALIDATES[resource];
      if (namespace) {
        void queryClient.invalidateQueries({ queryKey: queryKeys[namespace].all });
      }
    },
  });
}
