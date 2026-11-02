import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/auth/api-client';
import { CSV_DOMAINS, withSection } from '@/components/common/csv/csv-domains';
import { ApiClientError } from './api-client';
import { postCsvImport, useCsvImport } from './csv-service';

vi.mock('@/auth/api-client', () => ({ apiFetch: vi.fn() }));

const fetchMock = vi.mocked(apiFetch);

const RESULT = { imported: 2, errors: [], message: 'Imported 2 platforms.' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  fetchMock.mockReset();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  invalidated = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return Promise.resolve();
  });
});

const importable = Object.values(CSV_DOMAINS).filter((d) => d.importPath);

// The registry holds full `/api/v1/...` paths. Routing them through apiClient,
// which prefixes `/api/v1` itself, sent every import from v1.5.0 onward to a
// route that does not exist - and nothing noticed, because no test ever let
// the real mutation reach a URL.
describe('useCsvImport', () => {
  it.each(importable.map((d) => [d.resource, d.importPath!] as const))(
    '%s posts to its registry path exactly once-prefixed, and refreshes its list',
    async (resource, importPath) => {
      fetchMock.mockResolvedValue(jsonResponse(207, { success: true, data: RESULT }));
      const path = withSection(importPath, 'SQ1');

      const { result } = renderHook(() => useCsvImport(resource, path), { wrapper });
      await result.current.mutateAsync('designation\nX');

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      // postCsvImport passes a string path and a JSON string body.
      const target = url as string;
      expect(target).toBe(path);
      expect(target.match(/\/api\/v1/g)).toHaveLength(1);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ csv: 'designation\nX' });

      // A dataset missing from INVALIDATES imports fine and then shows the old
      // list until a reload, which reads as "the import did nothing".
      await waitFor(() => expect(invalidated).toHaveLength(1));
    },
  );
});

describe('postCsvImport', () => {
  it('returns the result of a partial import', async () => {
    fetchMock.mockResolvedValue(jsonResponse(207, { success: true, data: RESULT }));

    await expect(postCsvImport('/api/v1/platforms/import', 'x')).resolves.toEqual(RESULT);
  });

  // The server's rule: every row rejected is a 400 carrying the success
  // envelope, so the row reasons arrive. Treating it as an error threw them away.
  it('returns the row report when every row was rejected', async () => {
    const rejected = {
      imported: 0,
      errors: [{ row: 10, name: 'F-15C', errors: ['duplicate - designation already exists'] }],
      message: 'Imported 0 platforms, 1 row skipped.',
    };
    fetchMock.mockResolvedValue(jsonResponse(400, { success: true, data: rejected }));

    await expect(postCsvImport('/api/v1/platforms/import', 'x')).resolves.toEqual(rejected);
  });

  it('keeps the code and message of an error envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        success: false,
        error: { code: 'AUTH_FORBIDDEN', message: 'insufficient permissions' },
      }),
    );

    const err = await postCsvImport('/api/v1/platforms/import', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('AUTH_FORBIDDEN');
    expect((err as ApiClientError).message).toBe('insufficient permissions');
  });

  it('names the status when the response is not an API response at all', async () => {
    fetchMock.mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    const err = await postCsvImport('/api/v1/platforms/import', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).message).toMatch(/HTTP 404/);
  });
});
