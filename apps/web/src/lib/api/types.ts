/**
 * Types for the FastAPI management API.
 *
 * `*Wire` types mirror the JSON exactly (snake_case, FastAPI naming); the plain
 * records are the camelCase shapes the UI works with. Mapping lives in
 * `lib/api/flows.ts` so components never see snake_case.
 */

export type FlowStatus = 'draft' | 'live';

/** The React Flow document the engine reads. Free-form on the wire. */
export interface FlowGraph {
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number } | null;
  [key: string]: unknown;
}

export interface FlowWire {
  id: string;
  tenant_id: string;
  title: string;
  status: string;
  phone_number_id: string | null;
  /** Masked credential — the raw token is never returned by the API. */
  has_access_token: boolean;
  version: number;
  updated_at: string;
}

export interface FlowDetailWire extends FlowWire {
  graph: FlowGraph | null;
}

export interface FlowRecord {
  id: string;
  tenantId: string;
  title: string;
  status: FlowStatus;
  /** Routes inbound WhatsApp webhooks to this flow. */
  phoneNumberId: string | null;
  /** Whether this bot has its own Meta access token (never the raw value). */
  hasAccessToken: boolean;
  version: number;
  /** ISO-8601 timestamp. */
  updatedAt: string;
}

export interface FlowRecordDetail extends FlowRecord {
  graph: FlowGraph;
}

export interface FlowCreateInput {
  title?: string;
  tenantId?: string;
  status?: FlowStatus;
  phoneNumberId?: string | null;
  /** Write-only: sets the bot's own Meta access token. */
  accessToken?: string | null;
  graph?: FlowGraph;
}

export interface FlowUpdateInput {
  title?: string;
  status?: FlowStatus;
  phoneNumberId?: string | null;
  /** Write-only: non-empty sets the token, "" clears it, undefined leaves it. */
  accessToken?: string | null;
  graph?: FlowGraph;
}
