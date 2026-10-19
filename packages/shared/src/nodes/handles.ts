/**
 * Branching handles per node kind.
 *
 * Default is one input on the left and one output on the right. Nodes that
 * branch (Condition, A/B Test, Business Hours) expose multiple labelled
 * outputs, and trigger nodes expose no input at all.
 *
 * Interactive Options are the one config-driven case: each configured option
 * gets its own output handle, so a button can be wired to its own next node.
 * The option's `id` doubles as the `sourceHandle` the engine routes the tap
 * through (it is also the reply id sent to WhatsApp), and a trailing `out`
 * handle stays as the default path for free-text and unwired replies.
 */

import type { NodeKind } from '../types';
import type { NodeConfig } from './config';

export interface HandleSpec {
  id: string;
  label?: string;
}

export interface HandleLayout {
  targets: HandleSpec[];
  sources: HandleSpec[];
}

const DEFAULT_LAYOUT: HandleLayout = {
  targets: [{ id: 'in' }],
  sources: [{ id: 'out' }],
};

export const NODE_HANDLES: Record<NodeKind, HandleLayout> = {
  send_text: DEFAULT_LAYOUT,
  send_media: DEFAULT_LAYOUT,
  interactive_options: DEFAULT_LAYOUT,
  send_template: DEFAULT_LAYOUT,
  carousel: DEFAULT_LAYOUT,
  ask_question: DEFAULT_LAYOUT,
  request_location: DEFAULT_LAYOUT,
  webview: DEFAULT_LAYOUT,
  condition: {
    targets: [{ id: 'in' }],
    sources: [
      { id: 'true', label: 'True' },
      { id: 'false', label: 'False' },
    ],
  },
  jump: DEFAULT_LAYOUT,
  delay: DEFAULT_LAYOUT,
  set_variable: DEFAULT_LAYOUT,
  // Triggers: no inbound connection.
  global_keyword: { targets: [], sources: [{ id: 'out' }] },
  ab_test: {
    targets: [{ id: 'in' }],
    sources: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
  webhook: DEFAULT_LAYOUT,
  app_integration: DEFAULT_LAYOUT,
  send_email: DEFAULT_LAYOUT,
  dynamic_data: DEFAULT_LAYOUT,
  human_takeover: DEFAULT_LAYOUT,
  business_hours: {
    targets: [{ id: 'in' }],
    sources: [
      { id: 'open', label: 'Open' },
      { id: 'closed', label: 'Closed' },
    ],
  },
  // Terminal: nothing flows out of a closed chat.
  close_chat: { targets: [{ id: 'in' }], sources: [] },
  inactivity_trigger: { targets: [], sources: [{ id: 'out' }] },
  // Purely visual.
  sticky_note: { targets: [], sources: [] },
  error_catch: { targets: [], sources: [{ id: 'out' }] },
};

/**
 * One output handle per configured option, labelled with the option title.
 *
 * The id mirrors the engine's fallback exactly (`handlers.py` sends `opt_<n>`
 * when an option has no id), so a handle always matches the reply id Meta
 * echoes back for that button or list row.
 */
function optionSources(config?: NodeConfig): HandleSpec[] {
  const raw = config?.items;
  const items: unknown[] = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const sources: HandleSpec[] = [];

  items.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) return;
    const item = entry as { id?: unknown; label?: unknown };
    const id = typeof item.id === 'string' && item.id ? item.id : `opt_${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const label =
      typeof item.label === 'string' && item.label ? item.label : `Option ${index + 1}`;
    sources.push({ id, label });
  });

  // Default path: free-text replies and options nobody wired on the canvas.
  if (!seen.has('out')) sources.push({ id: 'out', label: 'Default' });
  return sources;
}

export function handlesFor(kind: NodeKind, config?: NodeConfig): HandleLayout {
  const layout = NODE_HANDLES[kind] ?? DEFAULT_LAYOUT;
  if (kind === 'interactive_options') {
    return { targets: layout.targets, sources: optionSources(config) };
  }
  return layout;
}
