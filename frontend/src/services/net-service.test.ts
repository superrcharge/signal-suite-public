import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateNet, useDeleteNet, useUpdateNet } from './net-service';
import { queryKeys } from './query-client';

vi.mock('./api-client', async () => ({
  ...(await vi.importActual('./api-client')),
  apiClient: {
    post: vi.fn().mockResolvedValue({ net: {} }),
    patch: vi.fn().mockResolvedValue({ net: {} }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  invalidated = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return Promise.resolve();
  });
});

/** The keys a mutation asked react-query to drop, once it has settled. */
async function keysInvalidatedBy(run: () => Promise<unknown>) {
  await run();
  await waitFor(() => expect(invalidated.length).toBeGreaterThan(0));
  return invalidated.map((k) => JSON.stringify(k));
}

// A net mutation has to drop the PACE cache as well as the nets cache: the card
// endpoint JOINs nets and returns the resolved name/tx_freq/rx_freq, so with the
// app's 5-minute staleTime a corrected frequency would otherwise keep printing
// at its old value -- on the sheet and on the print output -- for minutes.
describe('net mutations invalidate the PACE card, not just the nets list', () => {
  const netsKey = JSON.stringify(queryKeys.nets.all);
  const paceKey = JSON.stringify(queryKeys.pace.all);

  it('useCreateNet', async () => {
    const { result } = renderHook(() => useCreateNet(), { wrapper });
    const keys = await keysInvalidatedBy(() =>
      result.current.mutateAsync({ section: 'asqd', data: { name: 'NET 9' } }),
    );
    expect(keys).toContain(netsKey);
    expect(keys).toContain(paceKey);
  });

  it('useUpdateNet', async () => {
    const { result } = renderHook(() => useUpdateNet(), { wrapper });
    const keys = await keysInvalidatedBy(() =>
      result.current.mutateAsync({ id: 'id-1', data: { tx_freq: '31.5' } }),
    );
    expect(keys).toContain(netsKey);
    expect(keys).toContain(paceKey);
  });

  it('useDeleteNet', async () => {
    const { result } = renderHook(() => useDeleteNet(), { wrapper });
    const keys = await keysInvalidatedBy(() => result.current.mutateAsync('id-1'));
    expect(keys).toContain(netsKey);
    expect(keys).toContain(paceKey);
  });
});
