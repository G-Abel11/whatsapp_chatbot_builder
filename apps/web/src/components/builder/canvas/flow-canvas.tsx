'use client';

import '@xyflow/react/dist/style.css';

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_DEFINITIONS_BY_KIND } from '@opes/shared';
import { useFlowStore, useFlowDragging } from '@/lib/flow/store';
import { useFlowHistory } from '@/lib/flow/store';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/flow/types';
import { OpesNode } from './opes-node';
import { OpesEdge } from './opes-edge';
import { CommandPalette } from './command-palette';
import { BottomToolbar } from '../bottom-toolbar';

const nodeTypes = { opes: OpesNode } as const;
const edgeTypes = { opes: OpesEdge } as const;

interface InsertContext {
  edgeId?: string;
  position?: { x: number; y: number };
}

export function FlowCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rf = useReactFlow();

  const [dropPreview, setDropPreview] = useState<{ x: number; y: number } | null>(null);
  const [dropKind, setDropKind] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [insertCtx, setInsertCtx] = useState<InsertContext | null>(null);
  const lastPreview = useRef<{ x: number; y: number } | null>(null);

  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const selectNode = useFlowStore((s) => s.selectNode);
  const addNode = useFlowStore((s) => s.addNode);
  const insertNodeOnEdge = useFlowStore((s) => s.insertNodeOnEdge);
  const { pauseTemporal, resumeTemporal } = useFlowDragging();
  const { undo, redo } = useFlowHistory();

  /* The active bot is hydrated by BuilderView (it owns the flow id from the
     URL) and autosaved by the store itself — see `lib/flow/store.ts`. */

  /* Quick-add from the "+" button rendered on an edge, or from the toolbar. */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { edgeId: string; x: number; y: number } | undefined;
      if (detail) {
        setInsertCtx({ edgeId: detail.edgeId, position: { x: detail.x, y: detail.y } });
      } else {
        setInsertCtx(null);
      }
      setPaletteOpen(true);
    };
    window.addEventListener('opes:insert-on-edge', handler as EventListener);
    window.addEventListener('opes:open-palette', handler as EventListener);
    return () => {
      window.removeEventListener('opes:insert-on-edge', handler as EventListener);
      window.removeEventListener('opes:open-palette', handler as EventListener);
    };
  }, []);

  /* Keyboard: delete, undo/redo, duplicate. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete targets the selected node first, then any selected edge(s).
        const state = useFlowStore.getState();
        if (state.selectedNodeId) {
          e.preventDefault();
          state.removeSelectedNode();
        } else if (state.removeSelectedEdges()) {
          e.preventDefault();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo?.();
        else undo?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        const selected = useFlowStore.getState().selectedNodeId;
        if (selected) {
          e.preventDefault();
          useFlowStore.getState().duplicateNode(selected);
        }
      }
      if (e.key === 'Escape') {
        selectNode(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('opes:open-palette'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectNode]);

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => selectNode(node.id), [selectNode]);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const last = lastPreview.current;
      if (last && Math.abs(last.x - x) < 6 && Math.abs(last.y - y) < 6) return;
      lastPreview.current = { x, y };
      setDropKind(e.dataTransfer.types.includes('application/opes-node') ? 'node' : null);
      setDropPreview({ x, y });
    },
    [],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const outside =
      e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
    if (outside) {
      lastPreview.current = null;
      setDropKind(null);
      setDropPreview(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      lastPreview.current = null;
      setDropKind(null);
      setDropPreview(null);

      const kind = e.dataTransfer.getData('application/opes-node');
      if (!kind || !NODE_DEFINITIONS_BY_KIND[kind as keyof typeof NODE_DEFINITIONS_BY_KIND]) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // screenToFlowPosition expects viewport (client) coordinates.
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Centre the card under the cursor rather than snapping its top-left there.
      addNode(kind as never, { x: position.x - NODE_WIDTH / 2, y: position.y - NODE_HEIGHT / 2 });
    },
    [addNode, rf],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onEdgeClick={() => selectNode(null)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onNodeDragStart={() => pauseTemporal()}
        onNodeDragStop={() => resumeTemporal()}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        minZoom={0.15}
        maxZoom={1.8}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d8dee7" />
      </ReactFlow>

      {/* Glowing drop indicator */}
      {dropPreview && dropKind === 'node' && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: dropPreview.x, top: dropPreview.y }}
        >
          <div className="flex h-[78px] w-[256px] items-center justify-center rounded-xl border-2 border-dashed border-brand/70 bg-background/90 shadow-[0_0_0_6px_rgba(24,24,96,0.10)]">
            <span className="text-xs font-medium text-brand">Drop to add node</span>
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        context={insertCtx}
        onPick={(kind) => {
          const ctx = insertCtx;
          if (ctx?.edgeId && ctx.position) {
            insertNodeOnEdge(ctx.edgeId, kind, ctx.position);
          } else {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const center = rf.screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
              addNode(kind, { x: center.x - NODE_WIDTH / 2, y: center.y - NODE_HEIGHT / 2 });
            }
          }
          setInsertCtx(null);
        }}
      />
    </div>
  );
}

export function CanvasArea() {
  return (
    <>
      <FlowCanvas />
      <BottomToolbar />
    </>
  );
}
