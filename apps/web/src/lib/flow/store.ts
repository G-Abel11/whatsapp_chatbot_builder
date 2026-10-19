'use client';

import { create, useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { type NodeConfig, type NodeKind, type PublishStatus, handlesFor } from '@opes/shared';
import type { FlowEdge, FlowNode } from './types';
import { createFlowNode, createFlowEdge } from './factory';
import { layoutGraph } from './auto-layout';
import { deserializeGraph, serializeGraph } from './graph-io';
import { getFlow as apiGetFlow, updateFlow as apiUpdateFlow } from '@/lib/api/flows';
import { ApiError } from '@/lib/api/client';
import { upsertFlow } from './registry';

/**
 * The builder's canvas state.
 *
 * Persistence is the FastAPI service (there is no local copy): `hydrate` loads
 * a bot, every edit is debounced into a `PUT /flows/{id}`, and `persist` flushes
 * immediately. Two rules keep that honest:
 *
 *  - `hydrating` suppresses autosave for the synchronous `set()` calls a load
 *    performs, so opening a bot never writes it straight back.
 *  - Saves are serialised through `saveQueue` and always read the *current*
 *    state, so an edit made mid-request is neither lost nor written out of order.
 */

const SAVE_DEBOUNCE_MS = 600;

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

interface FlowActions {
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  setTitle: (title: string) => void;
  setStatus: (status: PublishStatus) => void;
  /** The WhatsApp business number that routes webhooks to this flow. */
  setPhoneNumberId: (value: string) => void;
  /**
   * Saves this bot's own Meta access token (write-only; a null/blank value
   * clears it and reverts to the server-wide default). Resolves true on success.
   */
  saveAccessToken: (token: string | null) => Promise<boolean>;
  toggleStatus: () => void;
  addNode: (kind: NodeKind, position: XYPosition) => string;
  insertNodeOnEdge: (edgeId: string, kind: NodeKind, position: XYPosition) => void;
  updateNodeConfig: (id: string, patch: NodeConfig) => void;
  duplicateNode: (id: string) => void;
  removeNode: (id: string) => void;
  removeSelectedNode: () => void;
  autoLayout: (direction?: 'LR' | 'TB') => void;
  /** Loads a bot from the API. */
  hydrate: (flowId: string) => Promise<void>;
  /** Flushes the canvas to the API now. */
  persist: () => Promise<void>;
}

export interface FlowState extends FlowActions {
  flowId: string | null;
  title: string;
  status: PublishStatus;
  phoneNumberId: string | null;
  /** Whether this bot has its own Meta access token (never the raw value). */
  hasAccessToken: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  savedAt: number | null;
  dirty: boolean;
  /** True while the bot is being fetched. */
  loading: boolean;
  /** Load failure (network / server), or null. */
  error: string | null;
  /** The requested bot doesn't exist (404). */
  notFound: boolean;
  /** A save is currently in flight. */
  saving: boolean;
  /** Failure of the last save, or null. */
  saveError: string | null;
}

const INITIAL_STATE = {
  flowId: null,
  title: 'Untitled bot',
  status: 'draft' as PublishStatus,
  phoneNumberId: null,
  hasAccessToken: false,
  nodes: [] as FlowNode[],
  edges: [] as FlowEdge[],
  selectedNodeId: null,
  savedAt: null,
  dirty: false,
  loading: false,
  error: null,
  notFound: false,
  saving: false,
  saveError: null,
};

/** Set for the synchronous duration of a hydrate `set()`, to mute autosave. */
let hydrating = false;

export const useFlowStore = create<FlowState>()(
  temporal(
    immer((set, get) => {
      /** Serialises writes so a slow response can't clobber a newer one. */
      let saveQueue: Promise<void> = Promise.resolve();

      const persistNow = async (): Promise<void> => {
        const state = get();
        const { flowId } = state;
        if (!flowId) return;

        const snapshot = {
          nodes: state.nodes,
          edges: state.edges,
          title: state.title,
          status: state.status,
          phoneNumberId: state.phoneNumberId,
        };

        set((draft) => {
          draft.saving = true;
        });

        try {
          const updated = await apiUpdateFlow(flowId, {
            title: snapshot.title,
            status: snapshot.status,
            phoneNumberId: snapshot.phoneNumberId,
            graph: serializeGraph(snapshot.nodes, snapshot.edges),
          });
          upsertFlow(updated);

          set((draft) => {
            draft.saveError = null;
            draft.savedAt = Date.now();
            // Anything edited while the request was in flight stays dirty; the
            // subscription will have queued another save for it.
            const current = get();
            if (
              current.nodes === snapshot.nodes &&
              current.edges === snapshot.edges &&
              current.title === snapshot.title &&
              current.status === snapshot.status &&
              current.phoneNumberId === snapshot.phoneNumberId
            ) {
              draft.dirty = false;
            }
          });
        } catch (error) {
          set((draft) => {
            draft.saveError = messageOf(error);
          });
        } finally {
          set((draft) => {
            draft.saving = false;
          });
        }
      };

      const enqueueSave = (): Promise<void> => {
        const run = () => persistNow();
        saveQueue = saveQueue.then(run, run);
        return saveQueue;
      };

      return {
        ...INITIAL_STATE,

        onNodesChange: (changes) => {
          // Selection and measurement changes are not user edits — keep them
          // out of the undo history.
          const visualOnly = changes.every((c) => c.type === 'select');
          if (visualOnly) {
            const temporal = useFlowStore.temporal.getState();
            temporal.pause();
            set((draft) => {
              draft.nodes = applyNodeChanges(changes, get().nodes) as FlowNode[];
            });
            temporal.resume();
            return;
          }
          set((draft) => {
            draft.nodes = applyNodeChanges(changes, get().nodes) as FlowNode[];
            draft.dirty = true;
          });
        },

        onEdgesChange: (changes) => {
          const visualOnly = changes.every((c) => c.type === 'select');
          if (visualOnly) {
            const temporal = useFlowStore.temporal.getState();
            temporal.pause();
            set((draft) => {
              draft.edges = applyEdgeChanges(changes, get().edges) as FlowEdge[];
            });
            temporal.resume();
            return;
          }
          set((draft) => {
            draft.edges = applyEdgeChanges(changes, get().edges) as FlowEdge[];
            draft.dirty = true;
          });
        },

        onConnect: (connection) => {
          set((draft) => {
            const edge = createFlowEdge(connection.source!, connection.target!, {
              sourceHandle: connection.sourceHandle ?? undefined,
              targetHandle: connection.targetHandle ?? undefined,
            });
            draft.edges = addEdge(edge, get().edges) as FlowEdge[];
            draft.dirty = true;
          });
        },

        selectNode: (id) => {
          set((draft) => {
            draft.selectedNodeId = id;
          });
        },

        setTitle: (title) => {
          set((draft) => {
            draft.title = title;
            draft.dirty = true;
          });
        },

        setStatus: (status) => {
          set((draft) => {
            draft.status = status;
            draft.dirty = true;
          });
        },

        setPhoneNumberId: (value) => {
          const next = value.trim();
          set((draft) => {
            draft.phoneNumberId = next ? next : null;
            draft.dirty = true;
          });
        },

        saveAccessToken: async (token) => {
          const flowId = get().flowId;
          if (!flowId) return false;
          // Wait out any in-flight canvas save so the PUTs don't race.
          await saveQueue;
          try {
            const updated = await apiUpdateFlow(flowId, { accessToken: token ?? '' });
            upsertFlow(updated);
            set((draft) => {
              draft.hasAccessToken = updated.hasAccessToken;
            });
            return true;
          } catch {
            // Errors surface in the credentials popover, not the save indicator.
            return false;
          }
        },

        toggleStatus: () => {
          set((draft) => {
            draft.status = draft.status === 'live' ? 'draft' : 'live';
            draft.dirty = true;
          });
        },

        addNode: (kind, position) => {
          const node = createFlowNode(kind, position);
          set((draft) => {
            draft.nodes.push(node);
            draft.selectedNodeId = node.id;
            draft.dirty = true;
          });
          return node.id;
        },

        insertNodeOnEdge: (edgeId, kind, position) => {
          const current = get();
          const edge = current.edges.find((e) => e.id === edgeId);
          if (!edge) return;

          const node = createFlowNode(kind, position);
          set((draft) => {
            draft.nodes.push(node);
            draft.edges = draft.edges.filter((e) => e.id !== edgeId);

            // Connect source -> new node.
            draft.edges.push(
              createFlowEdge(edge.source, node.id, {
                sourceHandle: edge.sourceHandle ?? undefined,
                targetHandle: undefined,
              }),
            );

            // Connect new node -> target. Respect target handle when present.
            draft.edges.push(
              createFlowEdge(node.id, edge.target, {
                sourceHandle: undefined,
                targetHandle: edge.targetHandle ?? undefined,
              }),
            );

            draft.selectedNodeId = node.id;
            draft.dirty = true;
          });
        },

        updateNodeConfig: (id, patch) => {
          set((draft) => {
            const node = draft.nodes.find((n) => n.id === id);
            if (node) {
              node.data.config = { ...node.data.config, ...patch };
              if ('items' in patch) {
                /* Option handles are derived from `items` — drop edges wired to
                   an option that no longer exists so the canvas never shows a
                   branch the engine can't reach. Edges without a handle (the
                   default path) are always kept. */
                const valid = new Set(
                  handlesFor(node.data.kind, node.data.config).sources.map((s) => s.id),
                );
                draft.edges = draft.edges.filter(
                  (e) => e.source !== id || !e.sourceHandle || valid.has(e.sourceHandle),
                );
              }
              draft.dirty = true;
            }
          });
        },

        duplicateNode: (id) => {
          const node = get().nodes.find((n) => n.id === id);
          if (!node) return;
          const clone = createFlowNode(node.data.kind, {
            x: node.position.x + 32,
            y: node.position.y + 32,
          });
          clone.data = { ...node.data, config: { ...node.data.config } };
          clone.selected = undefined;
          set((draft) => {
            draft.nodes.push(clone);
            draft.selectedNodeId = clone.id;
            draft.dirty = true;
          });
        },

        removeNode: (id) => {
          set((draft) => {
            draft.nodes = draft.nodes.filter((n) => n.id !== id);
            draft.edges = draft.edges.filter((e) => e.source !== id && e.target !== id);
            if (draft.selectedNodeId === id) draft.selectedNodeId = null;
            draft.dirty = true;
          });
        },

        removeSelectedNode: () => {
          const id = get().selectedNodeId;
          if (!id) return;
          get().removeNode(id);
        },

        autoLayout: (direction = 'LR') => {
          const laidOut = layoutGraph(get().nodes, get().edges, direction);
          set((draft) => {
            draft.nodes = laidOut;
            draft.dirty = true;
          });
        },

        hydrate: async (flowId) => {
          const id = flowId.trim();
          // Every `set()` below is part of loading, never an edit.
          hydrating = true;
          try {
            set((draft) => {
              draft.flowId = id;
              draft.loading = true;
              draft.error = null;
              draft.notFound = false;
            });

            const flow = await apiGetFlow(id);
            const { nodes, edges } = deserializeGraph(flow.graph);
            set((draft) => {
              draft.flowId = flow.id;
              draft.title = flow.title;
              draft.status = flow.status;
              draft.phoneNumberId = flow.phoneNumberId;
              draft.hasAccessToken = flow.hasAccessToken;
              draft.nodes = nodes;
              draft.edges = edges;
              draft.selectedNodeId = null;
              draft.savedAt = Date.now();
              draft.dirty = false;
              draft.loading = false;
              draft.error = null;
              draft.notFound = false;
              draft.saveError = null;
            });
          } catch (error) {
            set((draft) => {
              draft.loading = false;
              draft.nodes = [];
              draft.edges = [];
              draft.selectedNodeId = null;
              draft.dirty = false;
              draft.savedAt = null;
              if (error instanceof ApiError && error.isNotFound) {
                draft.notFound = true;
                draft.error = null;
              } else {
                draft.notFound = false;
                draft.error = messageOf(error);
              }
            });
          } finally {
            hydrating = false;
          }
          useFlowStore.temporal.getState().clear();
        },

        persist: () => enqueueSave(),
      };
    }),
    {
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        title: state.title,
        status: state.status,
      }),
      limit: 80,
      equality: (a, b) => {
        const sameNodes = a.nodes === b.nodes;
        const sameEdges = a.edges === b.edges;
        const sameTitle = a.title === b.title;
        const sameStatus = a.status === b.status;
        return sameNodes && sameEdges && sameTitle && sameStatus;
      },
    },
  ),
);

/*
 * Autosave. Lives here (not in a component effect) so it can mute itself during
 * hydration and stay alive across route changes — a debounced save still lands
 * if the user navigates back to the workspace mid-edit.
 */

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (typeof window === 'undefined') return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void useFlowStore.getState().persist();
  }, SAVE_DEBOUNCE_MS);
}

/** Persists immediately, cancelling any pending debounce. */
export function flushFlowSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return useFlowStore.getState().persist();
}

useFlowStore.subscribe((state, prev) => {
  if (hydrating) return;
  const changed =
    state.nodes !== prev.nodes ||
    state.edges !== prev.edges ||
    state.title !== prev.title ||
    state.status !== prev.status ||
    state.phoneNumberId !== prev.phoneNumberId;
  if (!changed || !state.flowId) return;
  scheduleSave();
});

if (typeof document !== 'undefined') {
  // Flush when the tab is hidden — the closest reliable point before an unload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useFlowStore.getState().dirty) {
      void flushFlowSave();
    }
  });
}

export const useFlowHistory = () => {
  const past = useStore(useFlowStore.temporal, (s) => s.pastStates.length);
  const future = useStore(useFlowStore.temporal, (s) => s.futureStates.length);
  const { undo, redo } = useFlowStore.temporal.getState();
  return { canUndo: past > 0, canRedo: future > 0, undo, redo };
};

export const useFlowDragging = () => {
  const { pause, resume } = useFlowStore.temporal.getState();
  return { pauseTemporal: pause, resumeTemporal: resume };
};
