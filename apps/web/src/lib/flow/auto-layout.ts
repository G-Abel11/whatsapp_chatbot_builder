import dagre from '@dagrejs/dagre';
import type { FlowEdge, FlowNode } from './types';
import { nodeSize } from './types';

export type LayoutDirection = 'LR' | 'TB';

/**
 * Auto-arrange the graph with dagre. Sticky notes are deliberately left where
 * the user put them — they are annotations, not part of the execution graph.
 */
export function layoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: LayoutDirection = 'LR',
): FlowNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction,
    nodesep: 56,
    ranksep: 110,
    marginx: 48,
    marginy: 48,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    if (node.data.kind === 'sticky_note') continue;
    const { width, height } = nodeSize(node);
    graph.setNode(node.id, {
      width: node.measured?.width ?? width,
      height: node.measured?.height ?? height,
    });
  }

  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    if (node.data.kind === 'sticky_note') return node;
    const point = graph.node(node.id) as { x: number; y: number } | undefined;
    if (!point) return node;
    const { width, height } = nodeSize(node);
    const w = node.measured?.width ?? width;
    const h = node.measured?.height ?? height;
    return {
      ...node,
      position: { x: Math.round(point.x - w / 2), y: Math.round(point.y - h / 2) },
    };
  });
}
