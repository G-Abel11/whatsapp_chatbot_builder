/**
 * Phase 2b — WhatsApp constraint analyser.
 *
 * A pure, derived pass run on every graph change. Nothing here writes back to
 * the flow store: warnings are computed at render time so they never pollute
 * the undo history or the persisted document.
 *
 * Checks:
 *   · reachability            — "orphaned" nodes floating off the flow,
 *   · dangling outputs        — a branch that simply stops,
 *   · interactive limits      — 3 buttons / 10 list rows / 10 cards,
 *                               button-title (20) and row-title (24) caps,
 *   · length ceilings         — body text + media caption (1024),
 *   · missing required content,
 *   · the 24-hour service window — free-form sends that would fire after it
 *     closes, which must be Template Messages instead.
 */

import {
  FREE_MESSAGE_WINDOW_MS,
  MAX_BUTTON_TITLE_CHARS,
  MAX_CAPTION_LENGTH,
  MAX_INTERACTIVE_BUTTONS,
  MAX_LIST_ROWS,
  MAX_ROW_TITLE_CHARS,
  MAX_TEXT_LENGTH,
  fieldsFor,
  handlesFor,
  type NodeConfig,
  type NodeKind,
} from '@opes/shared';
import type { FlowEdge, FlowNode } from './types';

export type NodeWarningCode =
  | 'orphaned'
  | 'no_outgoing'
  | 'too_many_options'
  | 'long_option_title'
  | 'text_too_long'
  | 'caption_too_long'
  | 'missing_content'
  | 'window_risk';

export interface NodeWarning {
  code: NodeWarningCode;
  message: string;
}

export interface NodeAnalysis {
  /** No path from any entry point reaches this node. */
  orphaned: boolean;
  warnings: NodeWarning[];
}

export interface FlowAnalysis {
  byNode: Map<string, NodeAnalysis>;
  /** Total number of warnings across the graph. */
  issueCount: number;
  orphanedIds: string[];
  /** Free-form sends that would run outside the 24h window. */
  windowRiskIds: string[];
  windowRemainingMs: number;
  windowOpen: boolean;
}

export interface AnalyzeOptions {
  /** Time left in the customer's 24-hour service window (defaults to a full window). */
  windowRemainingMs?: number;
}

/** Nodes that legitimately stop a branch — no "dangling output" warning. */
const TERMINAL_KINDS = new Set<NodeKind>(['close_chat', 'human_takeover', 'sticky_note']);

/** Nodes that send free-form content — only legal inside the 24h window. */
const FREE_FORM_KINDS = new Set<NodeKind>([
  'send_text',
  'send_media',
  'interactive_options',
  'carousel',
  'ask_question',
  'request_location',
  'webview',
]);

const CAROUSEL_MAX = fieldsFor('carousel').find((f) => f.key === 'cards')?.max ?? 10;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Interactive options use `label`; carousel cards use `title`. */
function itemLabel(item: unknown): string {
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    return asString(record.label) || asString(record.title);
  }
  return '';
}

/** Delay duration in milliseconds for `delay` nodes. */
function nodeDelay(config: NodeConfig): number {
  const amount = typeof config.amount === 'number' ? config.amount : 0;
  const unit = asString(config.unit) || 'minutes';
  const factor =
    unit === 'seconds'
      ? 1_000
      : unit === 'minutes'
        ? 60_000
        : unit === 'hours'
          ? 3_600_000
          : unit === 'days'
            ? 86_400_000
            : 60_000;
  return amount * factor;
}

/** Compact duration, e.g. "8h 12m", "2d 3h", "45m". */
export function formatWindow(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function analyzeFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  options: AnalyzeOptions = {},
): FlowAnalysis {
  const windowRemainingMs = Math.max(0, options.windowRemainingMs ?? FREE_MESSAGE_WINDOW_MS);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, FlowEdge[]>();
  const incomingCount = new Map<string, number>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  /* Reachability from entry points (nodes with no inbound connection). */
  const reached = new Set<string>();
  const queue: string[] = [];
  for (const node of nodes) {
    if (node.data.kind === 'sticky_note') continue;
    if ((incomingCount.get(node.id) ?? 0) === 0) {
      reached.add(node.id);
      queue.push(node.id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of outgoing.get(id) ?? []) {
      if (!reached.has(edge.target)) {
        reached.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  /* Earliest execution time per node, accounting for Delay nodes. */
  const delayOf = new Map<string, number>();
  for (const node of nodes) delayOf.set(node.id, node.data.kind === 'delay' ? nodeDelay(node.data.config) : 0);

  const elapsed = new Map<string, number>();
  for (const node of nodes) {
    const isEntry = node.data.kind !== 'sticky_note' && (incomingCount.get(node.id) ?? 0) === 0;
    elapsed.set(node.id, isEntry ? 0 : Number.POSITIVE_INFINITY);
  }
  for (let pass = 0; pass <= nodes.length; pass++) {
    let changed = false;
    for (const edge of edges) {
      const from = elapsed.get(edge.source);
      if (from === undefined || !Number.isFinite(from)) continue;
      const to = elapsed.get(edge.target);
      if (to === undefined) continue;
      const candidate = from + (delayOf.get(edge.source) ?? 0);
      if (candidate < to - 1) {
        elapsed.set(edge.target, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byNode = new Map<string, NodeAnalysis>();
  const orphanedIds: string[] = [];
  const windowRiskIds: string[] = [];
  let issueCount = 0;

  const ensure = (id: string): NodeAnalysis => {
    let entry = byNode.get(id);
    if (!entry) {
      entry = { orphaned: false, warnings: [] };
      byNode.set(id, entry);
    }
    return entry;
  };
  const record = (id: string, warning: NodeWarning) => {
    ensure(id).warnings.push(warning);
    issueCount += 1;
  };

  for (const node of nodes) {
    const { kind, config } = node.data;
    if (kind === 'sticky_note') continue;

    /* Structure */
    if (!reached.has(node.id)) {
      const entry = ensure(node.id);
      entry.orphaned = true;
      entry.warnings.push({ code: 'orphaned', message: 'Not connected to the flow.' });
      issueCount += 1;
      orphanedIds.push(node.id);
    }
    if (
      handlesFor(kind).sources.length > 0 &&
      !TERMINAL_KINDS.has(kind) &&
      (outgoing.get(node.id)?.length ?? 0) === 0
    ) {
      record(node.id, { code: 'no_outgoing', message: 'Nothing follows this node — the branch stops here.' });
    }

    /* Interactive limits */
    if (kind === 'interactive_options') {
      const items = asArray(config.items);
      const listMode = config.mode === 'list';
      const cap = listMode ? MAX_LIST_ROWS : MAX_INTERACTIVE_BUTTONS;
      const noun = listMode ? 'list rows' : 'reply buttons';
      if (items.length === 0) {
        record(node.id, { code: 'missing_content', message: 'Add at least one option.' });
      } else if (items.length > cap) {
        record(node.id, {
          code: 'too_many_options',
          message: `WhatsApp allows at most ${cap} ${noun} (currently ${items.length}).`,
        });
      }
      const titleCap = listMode ? MAX_ROW_TITLE_CHARS : MAX_BUTTON_TITLE_CHARS;
      if (items.some((item) => itemLabel(item).length > titleCap)) {
        record(node.id, {
          code: 'long_option_title',
          message: `${listMode ? 'Row' : 'Button'} titles are capped at ${titleCap} characters.`,
        });
      }
    }

    if (kind === 'carousel') {
      const cards = asArray(config.cards);
      if (cards.length === 0) {
        record(node.id, { code: 'missing_content', message: 'Add at least one card.' });
      } else if (cards.length > CAROUSEL_MAX) {
        record(node.id, {
          code: 'too_many_options',
          message: `WhatsApp allows at most ${CAROUSEL_MAX} cards (currently ${cards.length}).`,
        });
      }
    }

    /* Length ceilings */
    if (kind === 'send_text') {
      const text = asString(config.text);
      if (!text.trim()) record(node.id, { code: 'missing_content', message: 'Add the message text.' });
      else if (text.length > MAX_TEXT_LENGTH) {
        record(node.id, {
          code: 'text_too_long',
          message: `Message is ${text.length} characters — WhatsApp allows ${MAX_TEXT_LENGTH}.`,
        });
      }
    }
    if (kind === 'send_media') {
      if (!asString(config.url).trim()) {
        record(node.id, { code: 'missing_content', message: 'Add a media link.' });
      }
      const caption = asString(config.caption);
      if (caption.length > MAX_CAPTION_LENGTH) {
        record(node.id, {
          code: 'caption_too_long',
          message: `Caption is ${caption.length} characters — WhatsApp allows ${MAX_CAPTION_LENGTH}.`,
        });
      }
    }

    /* Missing content */
    if (kind === 'send_template' && !asString(config.name).trim()) {
      record(node.id, { code: 'missing_content', message: 'Choose a template to send.' });
    }
    if (kind === 'webhook' && !asString(config.url).trim()) {
      record(node.id, { code: 'missing_content', message: 'Add the endpoint URL.' });
    }
    if (kind === 'send_email' && !asString(config.to).trim()) {
      record(node.id, { code: 'missing_content', message: 'Add a recipient.' });
    }
    if (kind === 'ask_question' && !asString(config.question).trim()) {
      record(node.id, { code: 'missing_content', message: 'Add the question to ask.' });
    }
    if (kind === 'global_keyword' && asArray(config.keywords).length === 0) {
      record(node.id, { code: 'missing_content', message: 'Add at least one keyword.' });
    }

    /* 24-hour window */
    if (FREE_FORM_KINDS.has(kind)) {
      const at = elapsed.get(node.id);
      if (at !== undefined && Number.isFinite(at) && at > windowRemainingMs) {
        windowRiskIds.push(node.id);
        record(node.id, {
          code: 'window_risk',
          message: `Fires ~${formatWindow(at)} in, after the 24h window closes — use a Template Message instead.`,
        });
      }
    }
  }

  return {
    byNode,
    issueCount,
    orphanedIds,
    windowRiskIds,
    windowRemainingMs,
    windowOpen: windowRemainingMs > 0,
  };
}
