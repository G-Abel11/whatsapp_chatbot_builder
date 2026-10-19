import { nanoid } from 'nanoid';
import { defaultConfig, NODE_DEFINITIONS_BY_KIND, type NodeKind } from '@opes/shared';
import type { XYPosition } from '@xyflow/react';
import type { FlowEdge, FlowNode } from './types';

/** Builds a canvas node with defaults straight from the shared registry. */
export function createFlowNode(
  kind: NodeKind,
  position: XYPosition,
  overrides: Partial<FlowNode> & { config?: Record<string, unknown> } = {},
): FlowNode {
  const definition = NODE_DEFINITIONS_BY_KIND[kind];
  const { config, ...rest } = overrides;

  return {
    id: `${kind}_${nanoid(8)}`,
    type: 'opes',
    position,
    data: {
      kind,
      label: definition.label,
      config: { ...defaultConfig(kind), ...(config ?? {}) },
    },
    ...rest,
  } as FlowNode;
}

export function createFlowEdge(
  source: string,
  target: string,
  options: { sourceHandle?: string | null; targetHandle?: string | null; label?: string } = {},
): FlowEdge {
  return {
    id: `e_${source}-${target}-${nanoid(4)}`,
    source,
    target,
    sourceHandle: options.sourceHandle ?? undefined,
    targetHandle: options.targetHandle ?? undefined,
    type: 'opes',
    data: options.label ? { label: options.label } : undefined,
  };
}
