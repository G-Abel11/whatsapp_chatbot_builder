import { apiRequest } from './client';
import type { SimMessage, SimState, SimRole, SimMessageType } from '@/lib/flow/simulate';

/**
 * The phone preview runs the *real* execution engine — `POST /flows/{id}/simulate`
 * walks the saved flow with the same Python runner that processes webhooks, so
 * what you see is what WhatsApp receives: typed answers become variables, input
 * is validated and retried, branches decide themselves, terminal nodes stop the
 * conversation.
 *
 * Nothing is sent, webhooks are dry-run and delays are annotated instead of
 * waited out. The returned `state` is opaque — hand it back on the next turn.
 */

interface SimOptionDto {
  id: string;
  label: string;
}

interface SimCardDto {
  id: string;
  title: string;
  body?: string | null;
  url?: string | null;
}

/** The wire shape (snake_case), like every other endpoint in this API. */
interface SimMessageDto {
  id: string;
  role: SimRole;
  type: SimMessageType;
  node_id?: string | null;
  text?: string | null;
  caption?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  footer?: string | null;
  template_name?: string | null;
  language?: string | null;
  options?: SimOptionDto[];
  cards?: SimCardDto[];
}

interface SimPendingDto {
  type: 'input' | 'options';
  node_id: string;
  placeholder?: string | null;
  options?: SimOptionDto[];
}

interface SimulateResponseDto {
  state: Record<string, unknown>;
  messages: SimMessageDto[];
  pending: SimPendingDto | null;
  ended: boolean;
  status: 'active' | 'handed_off' | 'closed';
}

export type SimulateAction =
  | { type: 'input'; text: string }
  | { type: 'choice'; id: string; label: string };

export interface SimulateArgs {
  /** Runner state from the previous turn, or null to start from the top. */
  state: Record<string, unknown> | null;
  action?: SimulateAction;
  /** Builder's "Start at selected node" affordance. */
  startNodeId?: string;
  /** Pretend the customer opened the chat with this (keyword triggers). */
  text?: string;
}

export interface SimulateTurn {
  /** Rows produced by THIS turn — the caller appends them to its transcript. */
  messages: SimMessage[];
  pending: SimState['pending'] | null;
  state: Record<string, unknown>;
  ended: boolean;
  status: 'active' | 'handed_off' | 'closed';
}

function toPending(dto: SimPendingDto | null): SimState['pending'] {
  if (!dto) return null;
  if (dto.type === 'options') {
    return {
      type: 'options',
      nodeId: dto.node_id,
      options: (dto.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
      })),
    };
  }
  return { type: 'input', nodeId: dto.node_id, placeholder: dto.placeholder ?? '' };
}

function toMessage(dto: SimMessageDto): SimMessage {
  return {
    id: dto.id,
    // `node_id` is nullable on the wire (engine events with no node); the TS
    // contract keeps it a string, so fall back to '' — nothing matches it.
    nodeId: dto.node_id ?? '',
    role: dto.role,
    type: dto.type,
    text: dto.text ?? undefined,
    caption: dto.caption ?? undefined,
    mediaType: dto.media_type ?? undefined,
    mediaUrl: dto.media_url ?? undefined,
    footer: dto.footer ?? undefined,
    templateName: dto.template_name ?? undefined,
    language: dto.language ?? undefined,
    options: (dto.options ?? []).map((option) => ({ id: option.id, label: option.label })),
    cards: (dto.cards ?? []).map((card) => ({
      id: card.id,
      title: card.title,
      body: card.body ?? undefined,
      url: card.url ?? undefined,
    })),
  };
}

/** One turn of the engine-backed walkthrough. */
export async function simulateFlow(
  flowId: string,
  args: SimulateArgs,
): Promise<SimulateTurn> {
  const response = await apiRequest<SimulateResponseDto>(`/flows/${flowId}/simulate`, {
    method: 'POST',
    body: {
      state: args.state,
      action: args.action ?? null,
      start_node_id: args.startNodeId ?? null,
      text: args.text ?? null,
    },
  });

  return {
    messages: response.messages.map(toMessage),
    pending: toPending(response.pending),
    state: response.state,
    ended: response.ended,
    status: response.status,
  };
}
