import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/auth/api-client', () => ({ apiFetch: h.apiFetch }));

import { apiClient, ApiClientError } from './api-client';

/** The shape every MSAL error class shares, without importing MSAL. */
class FakeMsalError extends Error {
  constructor(
    public errorCode: string,
    public errorMessage: string,
  ) {
    super(errorMessage);
    this.name = 'BrowserAuthError';
  }
}

const jsonResponse = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

beforeEach(() => {
  vi.resetAllMocks();
});

/**
 * Every failure apiFetch raises reaches the page as an ApiClientError, so the
 * page's alert shows what happened instead of its generic fallback. The two
 * cases below are exactly the two that used to arrive as plain errors and so
 * as "Failed to load terminals" on the landing page.
 */
describe('apiClient labels transport failures', () => {
  it('turns an MSAL error that was thrown rather than redirected into AUTH_TOKEN_ERROR', async () => {
    h.apiFetch.mockRejectedValue(
      new FakeMsalError('interaction_in_progress', 'Interaction is currently in progress.'),
    );

    const err = await apiClient.get('/terminals').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    const labelled = err as ApiClientError;
    expect(labelled.code).toBe('AUTH_TOKEN_ERROR');
    expect(labelled.message).toBe(
      'Sign-in token unavailable (interaction_in_progress). Reload the page to sign in again.',
    );
    expect(labelled.details).toEqual({
      errorCode: 'interaction_in_progress',
      errorMessage: 'Interaction is currently in progress.',
    });
    // No status: shouldRetryQuery must keep treating it as it did the plain error.
    expect(labelled.status).toBeUndefined();
  });

  it('turns a fetch TypeError that survived the network retries into NETWORK_ERROR', async () => {
    h.apiFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const err = await apiClient.get('/terminals').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('NETWORK_ERROR');
    expect((err as ApiClientError).message).toBe('Network error: Failed to fetch');
  });

  it('leaves an error that is neither MSAL nor network as it was', async () => {
    const plain = new Error('boom');
    h.apiFetch.mockRejectedValue(plain);

    await expect(apiClient.post('/terminals', {})).rejects.toBe(plain);
  });

  it('still surfaces the server envelope on an HTTP error, with its status', async () => {
    h.apiFetch.mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: { code: 'AUTH_SYNC_FAILED', message: 'failed to sync user' },
      }),
    );

    const err = await apiClient.get('/terminals').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('AUTH_SYNC_FAILED');
    expect((err as ApiClientError).message).toBe('failed to sync user');
    expect((err as ApiClientError).status).toBe(500);
  });

  it('returns the data on success', async () => {
    h.apiFetch.mockResolvedValue(jsonResponse(200, { success: true, data: { terminals: [] } }));

    await expect(apiClient.get('/terminals')).resolves.toEqual({ terminals: [] });
  });
});
