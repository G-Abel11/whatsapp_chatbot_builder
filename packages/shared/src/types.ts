/**
 * Flow document types shared by the builder UI, the phone simulator and —
 * later — the server-side execution engine.
 */

export const NODE_CATEGORIES = [
  { id: 'messages', label: 'Messages', description: 'Display content' },
  { id: 'inputs', label: 'Inputs', description: 'Capture data from the user' },
  { id: 'logic', label: 'Logic & Flow', description: 'Branching and state' },
  { id: 'integrations', label: 'Integrations & Actions', description: 'Connect to the outside world' },
  { id: 'inbox', label: 'Inbox & Handoff', description: 'Human handoff and session control' },
] as const;

export type NodeCategoryId = (typeof NODE_CATEGORIES)[number]['id'];

export const NODE_KINDS = [
  // Category 1 — Messages
  'send_text',
  'send_media',
  'interactive_options',
  'send_template',
  'carousel',
  // Category 2 — Inputs
  'ask_question',
  'request_location',
  'webview',
  // Category 3 — Logic & Flow
  'condition',
  'jump',
  'delay',
  'set_variable',
  'global_keyword',
  'ab_test',
  // Category 4 — Integrations & Actions
  'webhook',
  'app_integration',
  'send_email',
  'dynamic_data',
  // Category 5 — Inbox & Handoff
  'human_takeover',
  'business_hours',
  'close_chat',
  'inactivity_trigger',
  'sticky_note',
  'error_catch',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** How the node is coloured on the canvas and in the toolbox. */
export type NodeTone = 'message' | 'input' | 'logic' | 'integration' | 'inbox';

export interface NodeDefinition {
  kind: NodeKind;
  category: NodeCategoryId;
  label: string;
  description: string;
  /** Name of the Lucide icon; mapped to a component by the web app. */
  icon: string;
  tone: NodeTone;
  /** Short WhatsApp constraint shown as a hint in the properties panel. */
  constraint?: string;
}

export type PublishStatus = 'draft' | 'live';

/** A flow as persisted (and later exported to the execution engine). */
export interface FlowDocument {
  id: string;
  tenantId: string;
  title: string;
  status: PublishStatus;
  /** React Flow graph: { nodes, edges, viewport } */
  graph: unknown;
  version: number;
  updatedAt: string;
}
