import type { Edge, Node } from '@xyflow/react';
import type { NodeConfig, NodeKind } from '@opes/shared';

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  config: NodeConfig;
  /**
   * WhatsApp constraint warnings + reachability. Derived at render time by
   * `lib/flow/analyze` (see `FlowAnalysisProvider`) rather than stored on the
   * node, so warnings never enter the undo history or the persisted document.
   */
  warnings?: string[];
  orphaned?: boolean;
}

export type FlowNode = Node<FlowNodeData, 'opes'>;

export interface FlowEdgeData extends Record<string, unknown> {
  /** Optional label rendered on the edge (branches such as True/False). */
  label?: string;
  branch?: string;
}

export type FlowEdge = Edge<FlowEdgeData>;

/** Rendered card size — also used as the dagre layout hint and drop ghost size. */
export const NODE_WIDTH = 256;
export const NODE_HEIGHT = 78;

export const STICKY_WIDTH = 220;
export const STICKY_HEIGHT = 140;

export function nodeSize(node: FlowNode): { width: number; height: number } {
  if (node.data.kind === 'sticky_note') {
    return { width: STICKY_WIDTH, height: STICKY_HEIGHT };
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}
