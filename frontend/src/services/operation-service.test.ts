import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './api-client';
import { useOperation, useUpdateParticipantById } from './operation-service';
import { queryKeys } from './query-client';
import type { UpdateParticipantRequest } from '@/types/operation';

const patch = vi.fn();

vi.mock('./api-client', async () => ({
  ...(await vi.importActual('./api-client')),
  apiClient: {
    patch: (...args: unknown[]) => patch(...args) as unknown,
  },
}));

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  patch.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  invalidated = [];
  vi.spyOn(client, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return Promise.resolve();
  });
});

const operationsKey = JSON.stringify(queryKeys.operations.all);
// The hook never reads the payload, so only the field the conflict is about is spelled out.
const STALE_READ = { expected_updated_at: '2026-10-13T00:00:00Z' } as UpdateParticipantRequest;
const save = (hook: ReturnType<typeof useUpdateParticipantById>) =>
  hook.mutateAsync({ operationId: 'op-1', participantId: 'p-1', data: STALE_READ });

// The wizard's Save carries the updated_at it last read, and a 409
// PARTICIPANT_STALE means that read is behind the server. With the app's
// 5-minute staleTime, a failed save that left the cache alone would have the
// next Edit resend the same timestamp and fail the same way until a page
// reload, which is what the help topic used to tell the user to do.
describe('useUpdateParticipantById refreshes the operation on a stale conflict', () => {
  it('invalidates the operations cache on PARTICIPANT_STALE', async () => {
    patch.mockRejectedValue(new ApiClientError('PARTICIPANT_STALE', 'changed by someone else', undefined, 409));
    const { result } = renderHook(() => useUpdateParticipantById(), { wrapper });
    await expect(save(result.current)).rejects.toBeInstanceOf(ApiClientError);
    await waitFor(() => expect(invalidated.map((k) => JSON.stringify(k))).toContain(operationsKey));
  });

  it('leaves the cache alone on any other failure', async () => {
    patch.mockRejectedValue(new ApiClientError('VALIDATION_ERROR', 'name is required', undefined, 400));
    const { result } = renderHook(() => useUpdateParticipantById(), { wrapper });
    await expect(save(result.current)).rejects.toBeInstanceOf(ApiClientError);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidated).toHaveLength(0);
  });

  it('still invalidates on success', async () => {
    patch.mockResolvedValue({ participant: { id: 'p-1' } });
    const { result } = renderHook(() => useUpdateParticipantById(), { wrapper });
    await save(result.current);
    await waitFor(() => expect(invalidated.map((k) => JSON.stringify(k))).toContain(operationsKey));
  });
});

describe('useOperation', () => {
  it('refetches the open operation every 10 seconds', () => {
    renderHook(() => useOperation('op-1'), { wrapper });
    const query = client.getQueryCache().find({ queryKey: queryKeys.operations.detail('op-1') });
    expect(query?.observers[0]?.options.refetchInterval).toBe(10_000);
    expect(query?.observers[0]?.options.refetchIntervalInBackground).toBeFalsy();
  });
});
