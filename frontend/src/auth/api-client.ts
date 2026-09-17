import { BrowserAuthError, BrowserAuthErrorCodes, InteractionRequiredAuthError } from '@azure/msal-browser';
import { authConfig, apiScope, msalInstance, getActiveAccount } from './msal-config';

// MSAL surfaces a stalled silent token renewal (hidden-iframe timeout, slow
// IdP) as a BrowserAuthError with one of these codes. Note: MSAL v5 does NOT
// have `monitor_window_timeout` (that was earlier versions) - `timed_out` is
// the code seen in practice, e.g. the photo-upload failure in an earlier issue.
const TIMEOUT_ERROR_CODES = new Set<string>([
  BrowserAuthErrorCodes.timedOut,
  BrowserAuthErrorCodes.nativeHandshakeTimeout,
]);

function isTimeoutError(err: unknown): boolean {
  return err instanceof BrowserAuthError && TIMEOUT_ERROR_CODES.has(err.errorCode);
}

/**
 * Acquire an access token for the API. Returns null when auth is
 * disabled (compose dev with AUTH_ENABLED=false) so callers know to
 * skip the Authorization header.
 *
 * A silent-renewal timeout is usually transient (a network blip or a slow
 * identity provider), so we retry the silent acquisition once before doing
 * anything disruptive - an interactive redirect tears down the page and loses
 * unsaved work (a half-filled catalog editor, an in-progress photo upload).
 * Only a persistent failure (expired refresh token, conditional access, or a
 * timeout that survives the retry) falls back to a redirect to re-authenticate.
 */
export async function acquireApiToken(forceRefresh = false): Promise<string | null> {
  if (!authConfig.enabled) {
    return null;
  }
  const account = getActiveAccount();
  if (!account) {
    return null;
  }

  let lastErr: unknown;
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: [apiScope], account, forceRefresh });
    return result.accessToken;
  } catch (err) {
    lastErr = err;
    if (isTimeoutError(err)) {
      // Retry the silent acquisition once - a transient timeout usually clears
      // on a second attempt without disturbing the user.
      try {
        const retry = await msalInstance.acquireTokenSilent({ scopes: [apiScope], account, forceRefresh });
        return retry.accessToken;
      } catch (retryErr) {
        lastErr = retryErr;
      }
    }
  }

  if (lastErr instanceof InteractionRequiredAuthError || isTimeoutError(lastErr)) {
    // Silent acquisition failed for real - clear stale tokens so the redirect
    // can't land back on the same broken state, then bounce through the login
    // UI. The redirect navigates away; this never resolves.
    await msalInstance.clearCache();
    await msalInstance.acquireTokenRedirect({ scopes: [apiScope], account });
    return null;
  }
  throw lastErr;
}

// Only idempotent methods are retried on a network-level failure. Retrying a
// POST could duplicate a server-side record (terminals/contracts assign a
// server-generated UUID on create) if the request reached the server but the
// response was lost on a dropped connection. Safe methods can be re-sent.
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']);
const MAX_NETWORK_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

function methodOf(init: RequestInit): string {
  return (init.method ?? 'GET').toUpperCase();
}

// fetch() rejects with a TypeError only for network-level failures (connection
// reset/dropped, DNS, TLS, offline). HTTP error *statuses* resolve normally, so
// this never matches a 4xx/5xx response - only genuine connectivity failures.
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * fetch with a short retry-with-backoff on network-level failures, so a
 * transient connectivity blip self-heals instead of surfacing
 * as a hard "failed to fetch" the user has to manually retry. Retries apply
 * only to idempotent methods; non-idempotent requests fail fast.
 */
async function fetchWithNetworkRetry(input: RequestInfo, init: RequestInit): Promise<Response> {
  const retriable = IDEMPOTENT_METHODS.has(methodOf(init));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (!retriable || !isNetworkError(err) || attempt >= MAX_NETWORK_RETRIES) {
        throw err;
      }
      await delay(RETRY_BASE_DELAY_MS * 2 ** attempt); // 300ms, then 600ms
    }
  }
}

/**
 * fetch wrapper that injects an Authorization: Bearer header when MSAL
 * has an account, and retries once with a force-refreshed token on a
 * 401. The retry handles tokens cached past server-side rotation.
 * Network-level failures are absorbed by fetchWithNetworkRetry.
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const token = await acquireApiToken(false);
  const response = await fetchWithNetworkRetry(input, withAuth(init, token));

  if (response.status !== 401 || !token) {
    return response;
  }

  const refreshed = await acquireApiToken(true);
  if (!refreshed) {
    return response;
  }
  return fetchWithNetworkRetry(input, withAuth(init, refreshed));
}

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...init, headers };
}
