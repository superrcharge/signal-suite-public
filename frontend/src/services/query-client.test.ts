import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/auth/api-client';
import { ApiClientError, apiClient } from './api-client';
import { queryClient, shouldRetryQuery } from './query-client';

vi.mock('@/auth/api-client', () => ({ apiFetch: vi.fn() }));

const fetchMock = vi.mocked(apiFetch);

/** The envelope `respondAuthError` and `response.Err` write, verbatim. */
function backendError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * How many requests one failing query makes under the app's real retry policy.
 * Only the backoff is zeroed, so the count is what a user's browser would send.
 */
async function requestsFor(respond: () => Response): Promise<number> {
  fetchMock.mockImplementation(() => Promise.resolve(respond()));
  const client = new QueryClient({
    defaultOptions: { queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  const { result } = renderHook(
    () => useQuery({ queryKey: ['probe'], queryFn: () => apiClient.get('/probe') }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isError).toBe(true));
  client.clear();
  return fetchMock.mock.calls.length;
}

// A paused retry waits for focus, and would read as a hang rather than a count.
beforeAll(() => focusManager.setFocused(true));
afterAll(() => focusManager.setFocused(undefined));
beforeEach(() => fetchMock.mockReset());

// These are the codes the backend actually sends. The predicate used to test
// for UNAUTHORIZED, FORBIDDEN and NOT_FOUND, which nothing sends, so each of
// these made four requests and held the error back for the whole backoff.
describe('a query is not retried on an answer that cannot change', () => {
  it.each([
    [401, 'AUTH_MISSING_TOKEN', 'authentication required'],
    [401, 'AUTH_INVALID_TOKEN', 'invalid token: expired'],
    [401, 'AUTH_REQUIRED', 'authentication required'],
    [401, 'AUTH_ERROR', 'something unexpected'],
    [403, 'AUTH_FORBIDDEN', 'insufficient permissions'],
    [403, 'USER_FORBIDDEN', 'cannot change your own role'],
    [404, 'EQUIPMENT_NOT_FOUND', 'equipment not found'],
    [400, 'VALIDATION_ERROR', 'validation failed'],
  ])('%i %s is requested once', async (status, code, message) => {
    expect(await requestsFor(() => backendError(status, code, message))).toBe(1);
  });

  it('a 401 with no JSON body, from something in front of the API, is requested once', async () => {
    const htmlPage = () => new Response('<html>Sign in</html>', { status: 401 });
    expect(await requestsFor(htmlPage)).toBe(1);
  });
});

describe('a query is still retried when trying again can help', () => {
  it.each([
    [500, 'INTERNAL_ERROR', 'internal server error'],
    [503, 'AUTH_PROVIDER_UNAVAILABLE', 'auth provider unavailable'],
    [429, 'RATE_LIMIT_EXCEEDED', 'too many requests'],
    [408, 'REQUEST_TIMEOUT', 'request timeout'],
  ])('%i %s is retried three times', async (status, code, message) => {
    expect(await requestsFor(() => backendError(status, code, message))).toBe(4);
  });

  it('a 502 HTML page from a proxy is retried three times', async () => {
    const htmlPage = () => new Response('<html>Bad Gateway</html>', { status: 502 });
    expect(await requestsFor(htmlPage)).toBe(4);
  });
});

describe('shouldRetryQuery', () => {
  it('carries the status onto the error, which is what it decides on', async () => {
    fetchMock.mockResolvedValue(backendError(403, 'AUTH_FORBIDDEN', 'insufficient permissions'));
    const err = await apiClient.get('/probe').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).status).toBe(403);
  });

  it('falls back to the retry budget for an error with no status', () => {
    const bare = new ApiClientError('WAVEFORM_IN_USE', 'built outside handleResponse');
    expect(shouldRetryQuery(0, bare)).toBe(true);
    expect(shouldRetryQuery(3, bare)).toBe(false);
  });

  it('retries a network failure, which never reaches a status', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
