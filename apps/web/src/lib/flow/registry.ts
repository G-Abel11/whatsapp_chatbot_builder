'use client';

import { useSyncExternalStore } from 'react';
import {
  createFlow as apiCreateFlow,
  deleteFlow as apiDeleteFlow,
  listFlows as apiListFlows,
} from '@/lib/api/flows';
import type { FlowRecord } from '@/lib/api/types';
import { createStarterNodes } from './seed';
import { serializeGraph } from './graph-io';
import { ApiError } from '@/lib/api/client';

/**
 * The workspace's bot registry — `GET /flows`.
 *
 * The API is the single source of truth: nothing is cached in localStorage.
 * This is a thin external store so components can subscribe with
 * `useSyncExternalStore` and the builder can push a freshly-saved row back
 * without refetching the whole list.
 */

export type FlowSummary = FlowRecord;

/** The tenancy the API falls back to when none is given. */
export const DEFAULT_TENANT = 'tenant_default';

export type FlowsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FlowsState {
  flows: FlowSummary[];
  status: FlowsStatus;
  /** Human-readable failure from the last load, if any. */
  error: string | null;
}

/** Stable reference for SSR and the first client render. */
const INITIAL: FlowsState = { flows: [], status: 'idle', error: null };

let snapshot: FlowsState = INITIAL;
const listeners = new Set<() => void>();

function emit(next: FlowsState): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFlowsState(): FlowsState {
  return snapshot;
}

/** Subscribes a component to the bot list. */
export function useFlows(): FlowsState {
  return useSyncExternalStore(subscribe, getFlowsState, () => INITIAL);
}

/** Synchronous lookup against the last loaded list. */
export function findFlow(id: string): FlowSummary | undefined {
  return snapshot.flows.find((flow) => flow.id === id);
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

let inFlight: Promise<FlowSummary[]> | null = null;

/**
 * Loads the bot list. Concurrent calls share one request. Never rejects — the
 * failure is surfaced through the snapshot so callers can `void refreshFlows()`.
 */
export function refreshFlows(): Promise<FlowSummary[]> {
  if (inFlight) return inFlight;

  emit({ ...snapshot, status: 'loading', error: null });
  inFlight = (async () => {
    try {
      const flows = await apiListFlows();
      emit({ flows, status: 'ready', error: null });
      return flows;
    } catch (error) {
      emit({ ...snapshot, status: 'error', error: messageOf(error) });
      return snapshot.flows;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Inserts or replaces one row (used after a save in the builder). */
export function upsertFlow(flow: FlowSummary): void {
  const exists = snapshot.flows.some((candidate) => candidate.id === flow.id);
  const flows = exists
    ? snapshot.flows.map((candidate) => (candidate.id === flow.id ? flow : candidate))
    : [flow, ...snapshot.flows];
  emit({ ...snapshot, flows, status: 'ready', error: null });
}

export function removeFlowFromCache(id: string): void {
  emit({ ...snapshot, flows: snapshot.flows.filter((flow) => flow.id !== id) });
}

/** Creates a bot, seeding an empty canvas with a single greeting node. */
export async function createFlow(title: string, tenantId = DEFAULT_TENANT): Promise<FlowSummary> {
  const trimmed = title.trim() || 'Untitled bot';
  const graph = serializeGraph(createStarterNodes(trimmed), []);
  const flow = await apiCreateFlow({
    title: trimmed,
    tenantId,
    status: 'draft',
    graph,
  });
  upsertFlow(flow);
  return flow;
}

export async function deleteFlow(id: string): Promise<void> {
  await apiDeleteFlow(id);
  removeFlowFromCache(id);
}
