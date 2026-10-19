import { apiRequest } from './client';
import type {
  FlowCreateInput,
  FlowDetailWire,
  FlowRecord,
  FlowRecordDetail,
  FlowStatus,
  FlowUpdateInput,
  FlowWire,
} from './types';

/** Flow CRUD against the FastAPI service (`/flows`). */

function toStatus(value: string): FlowStatus {
  return value === 'live' ? 'live' : 'draft';
}

/**
 * The API stores UTC. Postgres returns an explicit offset; SQLite (dev) does
 * not — `new Date("2026-10-18T12:30:51")` would then be read as local time and
 * date labels could land a day off, so pin a missing offset to UTC.
 */
function toIsoUtc(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}

function toRecord(wire: FlowWire): FlowRecord {
  return {
    id: wire.id,
    tenantId: wire.tenant_id,
    title: wire.title,
    status: toStatus(wire.status),
    phoneNumberId: wire.phone_number_id,
    hasAccessToken: wire.has_access_token,
    version: wire.version,
    updatedAt: toIsoUtc(wire.updated_at),
  };
}

function toDetail(wire: FlowDetailWire): FlowRecordDetail {
  return { ...toRecord(wire), graph: wire.graph ?? { nodes: [], edges: [] } };
}

export async function listFlows(): Promise<FlowRecord[]> {
  const flows = await apiRequest<FlowWire[]>('/flows');
  return flows.map(toRecord);
}

export async function getFlow(id: string): Promise<FlowRecordDetail> {
  const flow = await apiRequest<FlowDetailWire>(`/flows/${encodeURIComponent(id)}`);
  return toDetail(flow);
}

export async function createFlow(input: FlowCreateInput = {}): Promise<FlowRecord> {
  const flow = await apiRequest<FlowWire>('/flows', {
    method: 'POST',
    body: {
      tenant_id: input.tenantId,
      title: input.title,
      status: input.status,
      phone_number_id: input.phoneNumberId ?? null,
      access_token: input.accessToken ?? null,
      graph: input.graph,
    },
  });
  return toRecord(flow);
}

export async function updateFlow(id: string, patch: FlowUpdateInput): Promise<FlowRecord> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.phoneNumberId !== undefined) body.phone_number_id = patch.phoneNumberId;
  if (patch.accessToken !== undefined) body.access_token = patch.accessToken;
  if (patch.graph !== undefined) body.graph = patch.graph;

  const flow = await apiRequest<FlowWire>(`/flows/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
  });
  return toRecord(flow);
}

export async function deleteFlow(id: string): Promise<void> {
  await apiRequest<void>(`/flows/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
