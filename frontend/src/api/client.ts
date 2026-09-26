import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '@/lib/constants';
import type { ApiFailure, ApiSuccess, FieldIssue, PageResult } from '@/types/api';

/**
 * The access token is held in memory, not in localStorage.
 *
 * A token in localStorage is readable by any script that gets injected into the
 * page; keeping it in a module variable means a refresh of the tab simply
 * re-authenticates through the httpOnly refresh cookie instead of leaving a
 * long-lived credential lying around.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth provider so an expired session can bounce to login. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  // Required for the httpOnly refresh cookie to travel with `/auth/refresh`.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  // `Accept-Language` is a forbidden header name for fetch/XHR - a browser
  // silently drops any attempt to set it - so the chosen language travels in a
  // custom header the API reads first.
  const language = document.documentElement.lang;
  if (language) config.headers.set('X-Language', language);
  return config;
});

/**
 * Silent refresh.
 *
 * While one refresh is in flight every other 401 waits for the same promise, so
 * a screen that fires six queries at once does not fire six refreshes and
 * invalidate its own rotating token.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post<ApiSuccess<{ accessToken: string }>>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((response) => {
        const token = response.data.data.accessToken;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailure>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isAuthEndpoint = original?.url?.includes('/auth/refresh') || original?.url?.includes('/auth/login');

    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers.set('Authorization', `Bearer ${token}`);
        return httpClient(original);
      } catch {
        setAccessToken(null);
        onUnauthorized?.();
        return Promise.reject(error);
      }
    }

    if (status === 401 && !isAuthEndpoint) {
      setAccessToken(null);
      onUnauthorized?.();
    }

    // Unused, but keeps the intent explicit for future handling of specific codes.
    void code;
    return Promise.reject(error);
  },
);

// ------------------------------------------------------------------ errors

/**
 * A failure the UI can render directly: the backend already localised
 * `message`, so a toast can show it as-is, and `fieldIssues` can be pushed into
 * the form that produced them.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldIssues: FieldIssue[];
  readonly requestId?: string;

  constructor(message: string, code: string, status: number, fieldIssues: FieldIssue[] = [], requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.fieldIssues = fieldIssues;
    this.requestId = requestId;
  }

  get isValidation(): boolean {
    return this.code === 'VALIDATION_ERROR';
  }
  get isForbidden(): boolean {
    return this.code === 'FORBIDDEN';
  }
  get isInsufficientFunds(): boolean {
    return this.code === 'INSUFFICIENT_FUNDS';
  }
}

export function toApiError(error: unknown, networkMessage: string): ApiRequestError {
  if (error instanceof ApiRequestError) return error;

  if (axios.isAxiosError<ApiFailure>(error)) {
    const payload = error.response?.data;
    if (payload && typeof payload.message === 'string') {
      const details = Array.isArray(payload.details) ? (payload.details as FieldIssue[]) : [];
      return new ApiRequestError(
        payload.message,
        payload.code ?? 'INTERNAL_ERROR',
        error.response?.status ?? 0,
        details,
        payload.requestId,
      );
    }
    // No response body at all: the request never reached the API.
    return new ApiRequestError(networkMessage, 'NETWORK_ERROR', error.response?.status ?? 0);
  }

  return new ApiRequestError(
    error instanceof Error ? error.message : networkMessage,
    'INTERNAL_ERROR',
    0,
  );
}

// -------------------------------------------------------------- unwrapping

/** Unwraps `{ success, data }` so callers deal in domain objects only. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await httpClient.request<ApiSuccess<T>>(config);
  return response.data.data;
}

/** Same, but keeps the pagination meta the list screens need. */
export async function requestPage<T>(config: AxiosRequestConfig): Promise<PageResult<T>> {
  const response = await httpClient.request<ApiSuccess<T[]>>(config);
  return {
    items: response.data.data,
    meta:
      (response.data.meta as PageResult<T>['meta']) ??
      { page: 1, limit: response.data.data.length, total: response.data.data.length, totalPages: 1, hasNext: false, hasPrev: false },
  };
}

/** Returns the localised success sentence alongside the payload. */
export async function requestWithMessage<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; message: string }> {
  const response = await httpClient.request<ApiSuccess<T>>(config);
  return { data: response.data.data, message: response.data.message };
}
