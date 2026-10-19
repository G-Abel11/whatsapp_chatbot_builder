/**
 * The preview transcript contract shared by the phone simulator and the API
 * client that drives it.
 *
 * The preview is engine-backed (`POST /flows/{id}/simulate`): the Python
 * runner walks the saved flow and these types describe what it returns — the
 * messages one turn produced and the point the customer must act at next.
 *
 * `apps/api/tests/test_contract.py` parses the `SimMessageType` and `SimRole`
 * unions below to catch drift against the backend's `SimMessage` schema, so
 * keep them in sync with `app/schemas.py`.
 */

export type SimRole = 'bot' | 'customer' | 'system';

export type SimMessageType =
  | 'text'
  | 'media'
  | 'buttons'
  | 'list'
  | 'template'
  | 'carousel'
  | 'location'
  | 'webview'
  | 'system';

export interface SimOption {
  id: string;
  label: string;
}

export interface SimCard {
  id: string;
  title: string;
  body?: string;
  url?: string;
}

export interface SimMessage {
  id: string;
  /** Canvas node this bubble came from — used to anchor interactive chips. */
  nodeId: string;
  role: SimRole;
  type: SimMessageType;
  text?: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  footer?: string;
  options?: SimOption[];
  cards?: SimCard[];
  templateName?: string;
  language?: string;
}

/** One tappable row at a menu — `id` is the reply id the engine sent to WhatsApp. */
export interface SimPendingOption {
  id: string;
  label: string;
}

/** What the customer must do next — absent once the walk has ended. */
export type SimPending =
  | { type: 'input'; nodeId: string; placeholder: string }
  | { type: 'options'; nodeId: string; options: SimPendingOption[] };

export interface SimState {
  pending: SimPending | null;
  ended: boolean;
}
