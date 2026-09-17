import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock fns so the vi.mock factories below can reference them.
const h = vi.hoisted(() => ({
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn(),
  clearCache: vi.fn(),
  getActiveAccount: vi.fn(),
  authEnabled: { value: true },
}));

// Minimal stand-ins for the MSAL error classes so `instanceof` works and we
// can construct a BrowserAuthError with a specific errorCode.
vi.mock('@azure/msal-browser', () => {
  class InteractionRequiredAuthError extends Error {
    constructor(msg?: string) {
      super(msg);
      this.name = 'InteractionRequiredAuthError';
    }
  }
  class BrowserAuthError extends Error {
    errorCode: string;
    constructor(errorCode: string, msg?: string) {
      super(msg ?? errorCode);
      this.errorCode = errorCode;
      this.name = 'BrowserAuthError';
    }
  }
  return {
    InteractionRequiredAuthError,
    BrowserAuthError,
    BrowserAuthErrorCodes: { timedOut: 'timed_out', nativeHandshakeTimeout: 'native_handshake_timeout' },
  };
});

vi.mock('./msal-config', () => ({
  authConfig: {
    get enabled() {
      return h.authEnabled.value;
    },
  },
  apiScope: 'api://test/.default',
  msalInstance: {
    acquireTokenSilent: h.acquireTokenSilent,
    acquireTokenRedirect: h.acquireTokenRedirect,
    clearCache: h.clearCache,
  },
  getActiveAccount: h.getActiveAccount,
}));

import { acquireApiToken, apiFetch } from './api-client';
import { BrowserAuthError, InteractionRequiredAuthError } from '@azure/msal-browser';

const ok = (status: number) => ({ status }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  h.authEnabled.value = true;
  h.getActiveAccount.mockReturnValue({ homeAccountId: 'acc' });
  h.acquireTokenSilent.mockResolvedValue({ accessToken: 'tok' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('acquireApiToken', () => {
  it('returns the access token on a successful silent acquire', async () => {
    expect(await acquireApiToken()).toBe('tok');
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('returns null (skips auth) when auth is disabled', async () => {
    h.authEnabled.value = false;
    expect(await acquireApiToken()).toBeNull();
    expect(h.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('returns null when there is no active account', async () => {
    h.getActiveAccount.mockReturnValue(null);
    expect(await acquireApiToken()).toBeNull();
  });

  it('retries the silent acquire once on a timeout and succeeds without redirecting', async () => {
    h.acquireTokenSilent
      .mockRejectedValueOnce(new BrowserAuthError('timed_out', 'timed out'))
      .mockResolvedValueOnce({ accessToken: 'tok2' });

    expect(await acquireApiToken()).toBe('tok2');
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(2);
    expect(h.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('redirects when a timeout persists through the retry', async () => {
    h.acquireTokenSilent.mockRejectedValue(new BrowserAuthError('timed_out', 'timed out'));

    expect(await acquireApiToken()).toBeNull();
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(2); // initial + one retry
    expect(h.clearCache).toHaveBeenCalledTimes(1);
    expect(h.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('redirects immediately on InteractionRequiredAuthError (no timeout retry)', async () => {
    h.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('login_required', 'login required'));

    expect(await acquireApiToken()).toBeNull();
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(1); // not retried
    expect(h.clearCache).toHaveBeenCalledTimes(1);
    expect(h.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('rethrows an unexpected error without redirecting', async () => {
    h.acquireTokenSilent.mockRejectedValue(new Error('boom'));

    await expect(acquireApiToken()).rejects.toThrow('boom');
    expect(h.acquireTokenRedirect).not.toHaveBeenCalled();
  });
});

describe('apiFetch', () => {
  it('retries an idempotent GET on a network failure and succeeds', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok(200));

    const p = apiFetch('/x', { method: 'GET' });
    await vi.runAllTimersAsync();
    const res = await p;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a POST on a network failure (avoids duplicate creates)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/x', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the max retries on a persistent network failure', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const p = apiFetch('/x', { method: 'PATCH' }).then(
      () => 'resolved' as const,
      (err: unknown) => err,
    );
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('refreshes the token and retries once on a 401', async () => {
    fetchMock.mockResolvedValueOnce(ok(401)).mockResolvedValueOnce(ok(200));

    const res = await apiFetch('/x', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(h.acquireTokenSilent).toHaveBeenCalledTimes(2); // initial + forced refresh
  });

  it('attaches a Bearer header when a token is available', async () => {
    fetchMock.mockResolvedValueOnce(ok(200));

    await apiFetch('/x', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });
});
