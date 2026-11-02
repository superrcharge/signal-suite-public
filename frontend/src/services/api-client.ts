import { apiFetch } from '@/auth/api-client';
import type { ApiResponse, ApiError } from '@/types';

const API_BASE_URL = '/api/v1';

/**
 * Custom error class for API errors.
 *
 * `status` is the HTTP status the response carried. It is what decides whether
 * a failure is worth retrying, because `code` is chosen per domain by the
 * backend (`EQUIPMENT_NOT_FOUND`, `AUTH_FORBIDDEN`, `USER_FORBIDDEN`) and a
 * list of codes kept here goes stale the moment a handler names a new one.
 * Undefined only for an error built outside `handleResponse`.
 */
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, string>,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  static fromApiError(error: ApiError, status?: number): ApiClientError {
    return new ApiClientError(error.code, error.message, error.details, status);
  }
}

/**
 * The server's message when there is one, the caller's fallback otherwise.
 *
 * `err instanceof ApiClientError ? err.message : '…'` was open-coded at every
 * call site that surfaces a failure. That is harmless until the server starts
 * saying something worth reading - a 409 naming the assets carrying a waveform,
 * a 400 naming the abbrev that is not in the library - at which point a site
 * that forgot the ternary shows "Something went wrong" over a message that
 * would have told the user exactly what to do.
 *
 * Deliberately not reading `details`: it is a field-keyed map for form
 * validation, and flattening it into a sentence produces worse prose than the
 * message already is.
 */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

/**
 * Build common request headers. Authorization is handled by apiFetch
 * (MSAL token acquisition + 401 retry with forced refresh) - services
 * only set Content-Type and any caller-specific headers here.
 */
function createHeaders(customHeaders?: HeadersInit): Headers {
  const headers = new Headers(customHeaders);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

/**
 * True for an error MSAL raised: every one of its classes (BrowserAuthError,
 * ClientAuthError, ServerError, AuthError itself) carries a string errorCode.
 * Duck-typed rather than `instanceof AuthError` so this module does not import
 * MSAL, and so a test that mocks `@azure/msal-browser` with stand-ins still
 * takes this branch.
 */
function isMsalError(err: unknown): err is Error & { errorCode: string; errorMessage?: string } {
  return err instanceof Error && typeof (err as { errorCode?: unknown }).errorCode === 'string';
}

/**
 * apiFetch, with every failure it can raise turned into an ApiClientError.
 *
 * A page shows `err.message` when a failure is an ApiClientError and its own
 * fallback ("Failed to load terminals") otherwise. Two classes of failure used
 * to reach the page as plain errors and so as the fallback: an MSAL error that
 * is neither a timeout nor interaction-required (interaction_in_progress from a
 * sibling query's redirect, no_account_error after a clearCache,
 * post_request_failed when the token endpoint cannot be reached), and a fetch
 * TypeError that survived the network retries. Both told the user nothing and
 * an incident report less. The code and message now carry what MSAL or fetch
 * said, so the alert does, and the next report names the cause.
 *
 * No status on either, which is what keeps `shouldRetryQuery` treating them
 * exactly as it treated the plain errors: retried, never read as a 4xx.
 */
async function request(input: string, init: RequestInit): Promise<Response> {
  try {
    return await apiFetch(input, init);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    if (isMsalError(err)) {
      throw new ApiClientError(
        'AUTH_TOKEN_ERROR',
        `Sign-in token unavailable (${err.errorCode}). Reload the page to sign in again.`,
        { errorCode: err.errorCode, errorMessage: err.errorMessage ?? err.message },
      );
    }
    if (err instanceof TypeError) {
      throw new ApiClientError('NETWORK_ERROR', `Network error: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    if (!response.ok) {
      throw ApiClientError.fromApiError({ code: 'UNKNOWN_ERROR', message: 'Request failed' });
    }
    return undefined as T;
  }

  // A failure that did not come from our handlers - a proxy's HTML 502, an
  // App Service auth page - has no JSON envelope. Without this it surfaces as a
  // SyntaxError, which carries no status, so a 401 in front of the API would be
  // retried as if it were a network blip.
  let data: ApiResponse<T>;
  try {
    data = (await response.json()) as ApiResponse<T>;
  } catch (err) {
    if (response.ok) throw err;
    throw ApiClientError.fromApiError(
      { code: 'UNKNOWN_ERROR', message: `Request failed (${response.status})` },
      response.status,
    );
  }

  if (!response.ok || !data.success) {
    const error = data.error ?? {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    };
    throw ApiClientError.fromApiError(error, response.status);
  }

  return data.data as T;
}

/**
 * API client methods
 */
export const apiClient = {
  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await request(url.toString(), {
      method: 'GET',
      headers: createHeaders(),
    });

    return handleResponse<T>(response);
  },

  /**
   * POST request
   */
  async post<T, B = unknown>(endpoint: string, body?: B): Promise<T> {
    const response = await request(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: createHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return handleResponse<T>(response);
  },

  /**
   * PUT request
   */
  async put<T, B = unknown>(endpoint: string, body?: B): Promise<T> {
    const response = await request(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: createHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return handleResponse<T>(response);
  },

  /**
   * PATCH request
   */
  async patch<T, B = unknown>(endpoint: string, body?: B): Promise<T> {
    const response = await request(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: createHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return handleResponse<T>(response);
  },

  async postForm<T>(endpoint: string, body: FormData): Promise<T> {
    const headers = new Headers();
    const response = await request(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body,
    });
    return handleResponse<T>(response);
  },

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    const response = await request(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: createHeaders(),
    });

    return handleResponse<T>(response);
  },
};
