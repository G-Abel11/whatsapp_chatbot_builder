import { API_BASE_URL } from './config';
import { markApiOffline, markApiOnline } from './connection';

/** A non-2xx response, or a request that never reached the API (`status === 0`). */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  /** True when the API answered — we reached it, it just said no. */
  get reachedServer(): boolean {
    return this.status > 0;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

function describeError(status: number, detail: unknown): string {
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    const inner = (detail as { detail: unknown }).detail;
    if (typeof inner === 'string') return inner;
    if (Array.isArray(inner) && inner.length > 0) {
      const first = inner[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  if (typeof detail === 'string' && detail) return detail;
  return `Request failed with status ${status}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Thin `fetch` wrapper: JSON in/out, typed errors, connection reporting. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network error';
    markApiOffline(reason);
    throw new ApiError(`Can't reach the OpesChatbot API at ${API_BASE_URL}.`, 0, reason);
  }

  // Any response — even a 404 — proves the API is up.
  markApiOnline();

  if (!response.ok) {
    const detail = await readBody(response);
    throw new ApiError(describeError(response.status, detail), response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await readBody(response)) as T;
}
