import type { NodeDefinition, NodeKind, NodeTone } from '../types';

const def = (
  kind: NodeKind,
  category: NodeDefinition['category'],
  tone: NodeTone,
  icon: string,
  label: string,
  description: string,
  constraint?: string,
): NodeDefinition => ({ kind, category, tone, icon, label, description, constraint });

export const NODE_DEFINITIONS: NodeDefinition[] = [
  /* ── Category 1 · Messages (display) ─────────────────────────────────── */
  def(
    'send_text',
    'messages',
    'message',
    'MessageSquareText',
    'Send Text',
    'Send a plain text message.',
    'Max 1024 characters. Only inside the 24h window.',
  ),
  def(
    'send_media',
    'messages',
    'message',
    'ImagePlay',
    'Send Media',
    'Image, video, audio or document with an optional caption.',
    'Images ≤ 5 MB · Video/Audio ≤ 16 MB · Documents ≤ 100 MB.',
  ),
  def(
    'interactive_options',
    'messages',
    'message',
    'ListChecks',
    'Interactive Options',
    'Reply buttons or a selectable list.',
    'Max 3 buttons or 10 list rows.',
  ),
  def(
    'send_template',
    'messages',
    'message',
    'FileText',
    'Send Template',
    'Send an approved Meta template. Required outside the 24h window.',
    'Must be pre-approved by Meta. Supports 10 parameters.',
  ),
  def(
    'carousel',
    'messages',
    'message',
    'GalleryHorizontalEnd',
    'Carousel',
    'A swipeable set of product or content cards.',
    'Max 10 cards.',
  ),

  /* ── Category 2 · Inputs (data capture) ──────────────────────────────── */
  def(
    'ask_question',
    'inputs',
    'input',
    'MessageCircleQuestion',
    'Ask Question',
    'Ask anything — type is set below (text, email, phone, number, date, URL or file).',
    'Replies are free-form only inside the 24h window.',
  ),
  def(
    'request_location',
    'inputs',
    'input',
    'MapPin',
    'Request Location',
    'Ask the customer to share their live or pinned location.',
  ),
  def(
    'webview',
    'inputs',
    'input',
    'Globe',
    'Webview',
    'Open a web page inside the WhatsApp conversation.',
  ),

  /* ── Category 3 · Logic & flow ───────────────────────────────────────── */
  def(
    'condition',
    'logic',
    'logic',
    'GitBranch',
    'Condition',
    'If / else branching on variables, scores or user input.',
  ),
  def(
    'jump',
    'logic',
    'logic',
    'CornerDownRight',
    'Jump',
    'Connect to another part of the canvas without a visible edge.',
  ),
  def(
    'delay',
    'logic',
    'logic',
    'Timer',
    'Delay',
    'Wait for a set time before continuing.',
    'Crossing 24 hours forces a Template Message downstream.',
  ),
  def(
    'set_variable',
    'logic',
    'logic',
    'Box',
    'Set Variable',
    'Store data or update lead scoring at any point in the flow.',
  ),
  def(
    'global_keyword',
    'logic',
    'logic',
    'RadioTower',
    'Global Keyword',
    'Catch a keyword at any moment and jump to this path.',
    'Keyword matching is case-insensitive.',
  ),
  def(
    'ab_test',
    'logic',
    'logic',
    'Dices',
    'A/B Test',
    'Randomly split traffic 50/50 down two paths.',
  ),

  /* ── Category 4 · Integrations & actions ─────────────────────────────── */
  def(
    'webhook',
    'integrations',
    'integration',
    'Webhook',
    'Webhook',
    'Call any API and store the response.',
    'Must respond within 10s or the Error Catch path fires.',
  ),
  def(
    'app_integration',
    'integrations',
    'integration',
    'Puzzle',
    'App Integrations',
    'One-click connectors: Google Sheets, HubSpot, Zapier and more.',
  ),
  def(
    'send_email',
    'integrations',
    'integration',
    'Mail',
    'Send Email',
    'Send a transactional email with dynamic content.',
  ),
  def(
    'dynamic_data',
    'integrations',
    'integration',
    'Braces',
    'Dynamic Data',
    'Insert variables or expressions into any downstream text.',
  ),

  /* ── Category 5 · Inbox & human handoff ──────────────────────────────── */
  def(
    'human_takeover',
    'inbox',
    'inbox',
    'UserRoundCheck',
    'Human Takeover',
    'Pause the bot and hand the conversation to a live agent.',
  ),
  def(
    'business_hours',
    'inbox',
    'inbox',
    'Clock',
    'Business Hours',
    'Branch on whether it is currently inside working hours.',
  ),
  def(
    'close_chat',
    'inbox',
    'inbox',
    'CircleStop',
    'Close Chat',
    'End the conversation and clear the session state.',
  ),
  def(
    'inactivity_trigger',
    'inbox',
    'inbox',
    'Hourglass',
    'Inactivity Trigger',
    'Fire this path when the customer goes quiet.',
    'Follow-up beyond 24h requires a Template Message.',
  ),
  def(
    'sticky_note',
    'inbox',
    'inbox',
    'StickyNote',
    'Sticky Note',
    'A visual note for your team — never executes.',
  ),
  def(
    'error_catch',
    'inbox',
    'inbox',
    'ShieldAlert',
    'Error Catch',
    'Runs when an API call or webhook upstream fails.',
  ),
];

export const NODE_DEFINITIONS_BY_KIND: Record<NodeKind, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((d) => [d.kind, d]),
) as Record<NodeKind, NodeDefinition>;

export function nodesByCategory(category: NodeDefinition['category']): NodeDefinition[] {
  return NODE_DEFINITIONS.filter((d) => d.category === category);
}

export function searchNodes(query: string): NodeDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return NODE_DEFINITIONS;
  return NODE_DEFINITIONS.filter(
    (d) =>
      d.label.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q),
  );
}
