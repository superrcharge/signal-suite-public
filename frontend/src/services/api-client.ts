import { apiFetch } from '@/auth/api-client';
import type { ApiResponse, ApiError } from '@/types';

const API_BASE_URL = '/api/v1';

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  static fromApiError(error: ApiError): ApiClientError {
    return new ApiClientError(error.code, error.message, error.details);
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
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    if (!response.ok) {
      throw ApiClientError.fromApiError({ code: 'UNKNOWN_ERROR', message: 'Request failed' });
    }
    return undefined as T;
  }

  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !data.success) {
    const error = data.error ?? {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    };
    throw ApiClientError.fromApiError(error);
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

    const response = await apiFetch(url.toString(), {
      method: 'GET',
      headers: createHeaders(),
    });

    return handleResponse<T>(response);
  },

  /**
   * POST request
   */
  async post<T, B = unknown>(endpoint: string, body?: B): Promise<T> {
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
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
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
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
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: createHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return handleResponse<T>(response);
  },

  async postForm<T>(endpoint: string, body: FormData): Promise<T> {
    const headers = new Headers();
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
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
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: createHeaders(),
    });

    return handleResponse<T>(response);
  },
};
