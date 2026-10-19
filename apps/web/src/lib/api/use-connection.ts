'use client';

import { useSyncExternalStore } from 'react';
import {
  getApiConnection,
  getApiConnectionInitial,
  subscribeApiConnection,
  type ApiConnectionState,
} from './connection';

/**
 * React binding for the API connection store. Split out of `./connection` so the
 * fetch client can read/report connection state without importing React.
 */
export function useApiConnection(): ApiConnectionState {
  return useSyncExternalStore(
    subscribeApiConnection,
    getApiConnection,
    getApiConnectionInitial,
  );
}
