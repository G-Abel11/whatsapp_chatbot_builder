import { API_BASE_URL } from './config';

/**
 * Whether the browser can currently reach the FastAPI service.
 *
 * The app is API-backed — bots and flows live in the backend — so when this
 * reads `offline` the UI has nothing to show. This tiny store lets the shell
 * show an honest status pill instead of a blank screen, and lets the client
 * report reachability from any request that happens to run.
 *
 * Deliberately framework-free (no React import) so the fetch client can use it
 * from anywhere; the hook lives in `./use-connection`.
 */

export type ApiConnectionStatus = 'unknown' | 'checking' | 'online' | 'offline';

export interface ApiConnectionState {
  status: ApiConnectionStatus;
  /** When the status was last set (ms since epoch). */
  checkedAt: number | null;
  /** Failure reason when `status === 'offline'`. */
  error: string | null;
  baseUrl: string;
}

/** Stable reference for SSR and the first client render. */
const INITIAL: ApiConnectionState = {
  status: 'unknown',
  checkedAt: null,
  error: null,
  baseUrl: API_BASE_URL,
};

let snapshot: ApiConnectionState = INITIAL;
const listeners = new Set<() => void>();

function emit(next: ApiConnectionState) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Subscribes to connection changes (used by the `useApiConnection` hook). */
export function subscribeApiConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The initial snapshot, exposed so SSR reads are reference-stable. */
export function getApiConnectionInitial(): ApiConnectionState {
  return INITIAL;
}

export function getApiConnection(): ApiConnectionState {
  return snapshot;
}

/** Called by the API client whenever a response arrives (any status code). */
export function markApiOnline(): void {
  if (snapshot.status === 'online') return;
  emit({ ...snapshot, status: 'online', checkedAt: Date.now(), error: null });
}

/** Called by the API client when the request never made it out. */
export function markApiOffline(error: string): void {
  if (snapshot.status === 'offline' && snapshot.error === error) return;
  emit({ ...snapshot, status: 'offline', checkedAt: Date.now(), error });
}

function markChecking(): void {
  emit({ ...snapshot, status: 'checking' });
}

let inFlight: Promise<boolean> | null = null;

/** Pings `GET /health`. Coalesces concurrent calls. */
export function checkApiConnection(): Promise<boolean> {
  if (inFlight) return inFlight;
  markChecking();
  inFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
      if (!response.ok) {
        markApiOffline(`HTTP ${response.status}`);
        return false;
      }
      markApiOnline();
      return true;
    } catch (error) {
      markApiOffline(error instanceof Error ? error.message : 'Network error');
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
