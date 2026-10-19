import { NODE_DEFINITIONS_BY_KIND, type NodeKind } from '@opes/shared';
import type { FlowGraph } from '@/lib/api/types';
import type { FlowEdge, FlowNode } from './types';

/**
 * Converts between the in-memory React Flow graph and the document the API
 * stores.
 *
 * The backend reads `data.kind` / `data.config` / `data.label` and the edge
 * endpoints (see `app/engine/graph.py`), so that subset must survive the round
 * trip exactly. Everything React Flow adds at runtime (`selected`, `dragging`,
 * `measured`, …) is stripped so the saved document stays clean and diffable.
 */

const VOLATILE_NODE_KEYS = [
  'selected',
  'dragging',
  'measured',
  'positionAbsolute',
  'resizing',
  'initialWidth',
  'initialHeight',
] as const;

const VOLATILE_EDGE_KEYS = ['selected'] as const;

function stripKeys<T extends object>(value: T, keys: readonly string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  return copy;
}

export function serializeGraph(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return {
    nodes: nodes.map((node) => stripKeys(node, VOLATILE_NODE_KEYS)),
    edges: edges.map((edge) => stripKeys(edge, VOLATILE_EDGE_KEYS)),
  };
}

function isKnownKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && value in NODE_DEFINITIONS_BY_KIND;
}

export function deserializeGraph(graph: FlowGraph | null | undefined): {
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];

  const nodes: FlowNode[] = [];
  for (const raw of rawNodes) {
    const record = raw as Record<string, unknown>;
    const data = (record?.data ?? {}) as Record<string, unknown>;
    // Drop anything the editor can't render — an unknown kind would crash the
    // node component. Mirrors the guard in the backend's Graph.from_document.
    if (typeof record?.id !== 'string' || !isKnownKind(data.kind)) continue;
    nodes.push({
      ...record,
      id: record.id,
      type: 'opes',
      position: (record.position as FlowNode['position']) ?? { x: 0, y: 0 },
      data: {
        kind: data.kind,
        label: typeof data.label === 'string' && data.label ? data.label : String(data.kind),
        config: (data.config ?? {}) as FlowNode['data']['config'],
      },
    } as FlowNode);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: FlowEdge[] = [];
  for (const raw of rawEdges) {
    const record = raw as Record<string, unknown>;
    if (typeof record?.id !== 'string') continue;
    if (typeof record.source !== 'string' || typeof record.target !== 'string') continue;
    // A dangling edge would make React Flow log errors; skip it.
    if (!nodeIds.has(record.source) || !nodeIds.has(record.target)) continue;
    edges.push({
      ...record,
      id: record.id,
      source: record.source,
      target: record.target,
      type: 'opes',
      data: (record.data ?? undefined) as FlowEdge['data'],
    } as FlowEdge);
  }

  return { nodes, edges };
}
