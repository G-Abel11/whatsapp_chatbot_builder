import type { NodeKind } from '../types';

/**
 * Per-node configuration schema: field descriptors + defaults.
 *
 * Field descriptors drive three things at once:
 *   1. the preview line rendered on the canvas node,
 *   2. the properties panel form (Phase 3) via progressive disclosure,
 *   3. validation + payload mapping in the execution engine (backend phase).
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'tags'
  | 'keyvalue'
  | 'media'
  | 'options'
  | 'duration';

export interface FieldOption {
  value: string;
  label: string;
}

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  /** Advanced fields stay collapsed behind "Show advanced options". */
  advanced?: boolean;
  /**
   * Render WhatsApp formatting tools (bold / italic / strikethrough / monospace /
   * quote / bullets / emoji) beneath the input. Only set on fields whose text is
   * delivered as a WhatsApp message body — templates and button titles are shown
   * literally by Meta, so they never get the tools.
   */
  formatting?: boolean;
  /** Hard cap (e.g. 3 buttons, 10 list rows). */
  max?: number;
  min?: number;
  suffix?: string;
  rows?: number;
}

export type NodeConfig = Record<string, unknown>;

const select = (key: string, label: string, options: [string, string][], extra: Partial<NodeField> = {}): NodeField => ({
  key,
  label,
  type: 'select',
  options: options.map(([value, label]) => ({ value, label })),
  ...extra,
});

const text = (key: string, label: string, extra: Partial<NodeField> = {}): NodeField => ({
  key,
  label,
  type: 'text',
  ...extra,
});

const textarea = (key: string, label: string, extra: Partial<NodeField> = {}): NodeField => ({
  key,
  label,
  type: 'textarea',
  rows: 3,
  ...extra,
});

const number = (key: string, label: string, extra: Partial<NodeField> = {}): NodeField => ({
  key,
  label,
  type: 'number',
  ...extra,
});

const toggle = (key: string, label: string, extra: Partial<NodeField> = {}): NodeField => ({
  key,
  label,
  type: 'toggle',
  ...extra,
});

export const NODE_FIELDS: Record<NodeKind, NodeField[]> = {
  /* ── Messages ────────────────────────────────────────────────────────── */
  send_text: [
    textarea('text', 'Message', {
      placeholder: 'Hi {{name}} 👋',
      help: 'Max 1024 characters. Supports {{variables}} and WhatsApp formatting (*bold* _italic_ ~strike~).',
      formatting: true,
    }),
  ],
  send_media: [
    select(
      'mediaType',
      'Media type',
      [
        ['image', 'Image'],
        ['video', 'Video'],
        ['audio', 'Audio'],
        ['document', 'Document'],
      ],
      { help: 'Images ≤ 5 MB · Video/Audio ≤ 16 MB · Documents ≤ 100 MB.' },
    ),
    text('url', 'Media link', { placeholder: 'https://cdn.example.com/file.jpg' }),
    textarea('caption', 'Caption', { advanced: true, placeholder: 'Optional caption', formatting: true }),
    text('filename', 'File name', { advanced: true, placeholder: 'invoice-1024.pdf' }),
  ],
  interactive_options: [
    select('mode', 'Type', [
      ['buttons', 'Reply buttons'],
      ['list', 'List menu'],
    ]),
    textarea('body', 'Body text', { placeholder: 'How would you like to continue?', formatting: true }),
    {
      key: 'items',
      label: 'Options',
      type: 'options',
      max: 3,
      help:
        'Max 3 buttons or 10 list rows on WhatsApp. Each option gets its own handle on the node — drag from it to send that answer somewhere specific. Unwired options follow the Default handle.',
    },
    textarea('footer', 'Footer', { advanced: true, placeholder: 'Acme Retail', rows: 2, formatting: true }),
  ],
  send_template: [
    text('name', 'Template name', { placeholder: 'order_confirmation' }),
    select('language', 'Language', [
      ['en_US', 'English (US)'],
      ['en_GB', 'English (UK)'],
      ['sw', 'Swahili'],
      ['fr', 'French'],
      ['es', 'Spanish'],
    ]),
    {
      key: 'variables',
      label: 'Body variables',
      type: 'tags',
      advanced: true,
      help: 'Values for {{1}}, {{2}} … in order.',
    },
  ],
  carousel: [
    {
      key: 'cards',
      label: 'Cards',
      type: 'options',
      max: 10,
      help: 'Max 10 cards. Each card needs an image and a title.',
    },
    textarea('body', 'Intro text', { advanced: true, placeholder: 'Take a look at these…', formatting: true }),
  ],

  /* ── Inputs ──────────────────────────────────────────────────────────── */
  ask_question: [
    textarea('question', 'Question', { placeholder: 'What is your email address?', formatting: true }),
    select('inputType', 'Answer type', [
      ['text', 'Text'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['number', 'Number'],
      ['date', 'Date'],
      ['url', 'URL'],
      ['file', 'File upload'],
    ]),
    text('variable', 'Save answer to', {
      placeholder: 'customer_email',
      help: 'Stored as {{customer_email}} for the rest of the flow.',
    }),
    textarea('retryMessage', 'Retry message', {
      advanced: true,
      placeholder: "That doesn't look right — try again?",
      rows: 2,
    }),
  ],
  request_location: [
    textarea('prompt', 'Prompt', { placeholder: 'Share your delivery location 📍', formatting: true }),
    text('variable', 'Save to variable', { advanced: true, placeholder: 'customer_location' }),
  ],
  webview: [
    text('url', 'Page URL', { placeholder: 'https://shop.example.com/order' }),
    text('title', 'Button label', { placeholder: 'View order' }),
    select(
      'size',
      'Height',
      [
        ['tall', 'Tall (100%)'],
        ['medium', 'Medium (75%)'],
        ['short', 'Short (50%)'],
      ],
      { advanced: true },
    ),
  ],

  /* ── Logic & flow ────────────────────────────────────────────────────── */
  condition: [
    text('variable', 'Variable', { placeholder: 'lead_score' }),
    select('operator', 'Condition', [
      ['equals', 'is equal to'],
      ['not_equals', 'is not equal to'],
      ['contains', 'contains'],
      ['greater_than', 'is greater than'],
      ['less_than', 'is less than'],
      ['exists', 'exists'],
      ['not_exists', 'does not exist'],
    ]),
    text('value', 'Value', { placeholder: '50' }),
    toggle('caseSensitive', 'Case sensitive', { advanced: true }),
  ],
  jump: [
    text('target', 'Destination', { placeholder: 'Booking flow → Step 2' }),
    toggle('carryVariables', 'Carry variables across', { advanced: true }),
  ],
  delay: [
    number('amount', 'Wait for', { min: 1, placeholder: '5' }),
    select('unit', 'Unit', [
      ['seconds', 'Seconds'],
      ['minutes', 'Minutes'],
      ['hours', 'Hours'],
      ['days', 'Days'],
    ]),
    toggle('skipOutsideWindow', 'Send a template if the 24h window has closed', {
      advanced: true,
    }),
  ],
  set_variable: [
    text('variable', 'Variable', { placeholder: 'lead_score' }),
    text('value', 'Value', { placeholder: '{{lead_score}} + 10' }),
    select(
      'operation',
      'Operation',
      [
        ['set', 'Set to'],
        ['increment', 'Increment by'],
        ['append', 'Append to'],
      ],
      { advanced: true },
    ),
  ],
  global_keyword: [
    { key: 'keywords', label: 'Keywords', type: 'tags', help: 'Matched at any point in the conversation.' },
    select('matchType', 'Match', [
      ['contains', 'Contains'],
      ['exact', 'Exactly'],
      ['starts_with', 'Starts with'],
    ]),
    toggle('caseSensitive', 'Case sensitive', { advanced: true }),
  ],
  ab_test: [
    number('split', 'Split % to path A', { min: 1, suffix: '%', placeholder: '50' }),
    text('labelA', 'Path A label', { advanced: true, placeholder: 'Variant A' }),
    text('labelB', 'Path B label', { advanced: true, placeholder: 'Variant B' }),
  ],

  /* ── Integrations & actions ──────────────────────────────────────────── */
  webhook: [
    select('method', 'Method', [
      ['POST', 'POST'],
      ['GET', 'GET'],
      ['PUT', 'PUT'],
      ['PATCH', 'PATCH'],
      ['DELETE', 'DELETE'],
    ]),
    text('url', 'Endpoint URL', { placeholder: 'https://api.example.com/leads' }),
    { key: 'headers', label: 'Headers', type: 'keyvalue', advanced: true },
    textarea('body', 'Request body', {
      advanced: true,
      rows: 4,
      placeholder: '{ "email": "{{customer_email}}" }',
    }),
    number('timeout', 'Timeout', { advanced: true, suffix: 's', min: 1 }),
    text('saveResponseTo', 'Save response to', { advanced: true, placeholder: 'api_response' }),
  ],
  app_integration: [
    select('app', 'App', [
      ['google_sheets', 'Google Sheets'],
      ['hubspot', 'HubSpot'],
      ['salesforce', 'Salesforce'],
      ['slack', 'Slack'],
      ['notion', 'Notion'],
      ['zapier', 'Zapier'],
      ['airtable', 'Airtable'],
    ]),
    text('action', 'Action', { placeholder: 'Create row' }),
    { key: 'mapping', label: 'Field mapping', type: 'keyvalue', advanced: true },
  ],
  send_email: [
    text('to', 'To', { placeholder: '{{customer_email}}' }),
    text('subject', 'Subject', { placeholder: 'Your Acme Retail order' }),
    textarea('body', 'Body', { rows: 4, placeholder: 'Hi {{name}},' }),
    text('replyTo', 'Reply-to', { advanced: true, placeholder: 'support@acme.co.ke' }),
  ],
  dynamic_data: [
    text('expression', 'Expression', { placeholder: '{{first_name}} {{last_name}}' }),
    text('fallback', 'Fallback value', { advanced: true, placeholder: 'there' }),
  ],

  /* ── Inbox & handoff ─────────────────────────────────────────────────── */
  human_takeover: [
    text('team', 'Route to team', { placeholder: 'Sales' }),
    textarea('message', 'Message to customer', {
      placeholder: 'Connecting you to an agent now…',
      rows: 2,
      formatting: true,
    }),
    select(
      'priority',
      'Priority',
      [
        ['normal', 'Normal'],
        ['high', 'High'],
      ],
      { advanced: true },
    ),
  ],
  business_hours: [
    text('timezone', 'Timezone', { placeholder: 'Africa/Nairobi' }),
    text('schedule', 'Schedule', { advanced: true, placeholder: 'Mon–Fri, 09:00–17:00' }),
  ],
  close_chat: [
    textarea('message', 'Closing message', {
      advanced: true,
      placeholder: 'Thanks for chatting with us!',
      rows: 2,
      formatting: true,
    }),
    toggle('clearSession', 'Clear conversation state', { advanced: true }),
  ],
  inactivity_trigger: [
    number('amount', 'After', { min: 1, placeholder: '30' }),
    select(
      'unit',
      'Unit',
      [
        ['minutes', 'Minutes'],
        ['hours', 'Hours'],
        ['days', 'Days'],
      ],
      { placeholder: 'minutes' },
    ),
    textarea('message', 'Follow-up message', {
      advanced: true,
      rows: 2,
      placeholder: 'Still there? Tap below to continue.',
      formatting: true,
    }),
  ],
  sticky_note: [
    textarea('text', 'Note', { rows: 4, placeholder: 'Ideas, TODOs, handover notes…' }),
    select('color', 'Colour', [
      ['amber', 'Amber'],
      ['slate', 'Slate'],
      ['green', 'Green'],
      ['indigo', 'Indigo'],
    ]),
  ],
  error_catch: [
    number('retries', 'Retries', { min: 0, max: 5, placeholder: '2' }),
    text('notifyEmail', 'Notify email', { advanced: true, placeholder: 'ops@acme.co.ke' }),
    textarea('fallbackMessage', 'Fallback message', {
      advanced: true,
      rows: 2,
      placeholder: 'Something went wrong — a human will follow up shortly.',
      formatting: true,
    }),
  ],
};

export const NODE_DEFAULTS: Record<NodeKind, NodeConfig> = {
  send_text: { text: 'Hi {{name}} 👋 Thanks for reaching out!' },
  send_media: { mediaType: 'image', url: '', caption: '', filename: '' },
  interactive_options: {
    mode: 'buttons',
    body: 'How would you like to continue?',
    items: [
      { id: 'opt_1', label: 'Browse catalog' },
      { id: 'opt_2', label: 'Track my order' },
    ],
    footer: '',
  },
  send_template: { name: 'order_confirmation', language: 'en_US', variables: [] },
  carousel: {
    cards: [
      { id: 'card_1', title: 'New arrivals', body: 'Fresh stock just landed', url: '' },
      { id: 'card_2', title: 'Best sellers', body: 'What everyone is buying', url: '' },
    ],
    body: '',
  },
  ask_question: {
    question: 'What is your email address?',
    inputType: 'email',
    variable: 'customer_email',
    retryMessage: '',
  },
  request_location: { prompt: 'Share your delivery location 📍', variable: 'customer_location' },
  webview: { url: '', title: 'Open page', size: 'tall' },

  condition: { variable: 'lead_score', operator: 'greater_than', value: '50', caseSensitive: false },
  jump: { target: '', carryVariables: true },
  delay: { amount: 5, unit: 'minutes', skipOutsideWindow: true },
  set_variable: { variable: 'lead_score', value: '{{lead_score}} + 10', operation: 'set' },
  global_keyword: { keywords: ['agent', 'human'], matchType: 'contains', caseSensitive: false },
  ab_test: { split: 50, labelA: 'Variant A', labelB: 'Variant B' },

  webhook: {
    method: 'POST',
    url: 'https://api.example.com/leads',
    headers: [],
    body: '{ "email": "{{customer_email}}" }',
    timeout: 10,
    saveResponseTo: 'api_response',
  },
  app_integration: { app: 'google_sheets', action: 'Create row', mapping: [] },
  send_email: {
    to: '{{customer_email}}',
    subject: 'Your Acme Retail order',
    body: 'Hi {{name}},',
    replyTo: '',
  },
  dynamic_data: { expression: '{{first_name}} {{last_name}}', fallback: '' },

  human_takeover: {
    team: 'Sales',
    message: 'Connecting you to an agent now…',
    priority: 'normal',
  },
  business_hours: { timezone: 'Africa/Nairobi', schedule: 'Mon–Fri, 09:00–17:00' },
  close_chat: { message: 'Thanks for chatting with us!', clearSession: true },
  inactivity_trigger: { amount: 30, unit: 'minutes', message: '' },
  sticky_note: { text: 'Ideas, TODOs, handover notes…', color: 'amber' },
  error_catch: { retries: 2, notifyEmail: '', fallbackMessage: '' },
};

export function defaultConfig(kind: NodeKind): NodeConfig {
  return structuredClone(NODE_DEFAULTS[kind]);
}

export function fieldsFor(kind: NodeKind): NodeField[] {
  return NODE_FIELDS[kind] ?? [];
}
