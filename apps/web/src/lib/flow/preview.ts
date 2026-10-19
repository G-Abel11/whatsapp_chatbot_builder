import type { NodeConfig, NodeKind } from '@opes/shared';

/**
 * One-line human summary of a node's configuration, rendered as the body of
 * the canvas card. Kept pure so the phone simulator (Phase 3) can reuse it.
 */

function str(config: NodeConfig, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

function num(config: NodeConfig, key: string): number | null {
  const value = config[key];
  return typeof value === 'number' ? value : null;
}

function count(config: NodeConfig, key: string): number {
  const value = config[key];
  return Array.isArray(value) ? value.length : 0;
}

function truncate(text: string, max = 68): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function nodePreview(kind: NodeKind, config: NodeConfig): string {
  switch (kind) {
    case 'send_text':
      return truncate(str(config, 'text')) || 'Empty message';

    case 'send_media': {
      const type = str(config, 'mediaType') || 'image';
      const caption = truncate(str(config, 'caption'), 40);
      return caption ? `${capitalise(type)} · ${caption}` : `${capitalise(type)} message`;
    }

    case 'interactive_options': {
      const mode = str(config, 'mode') === 'list' ? 'List menu' : 'Reply buttons';
      const n = count(config, 'items');
      return `${mode} · ${n} ${n === 1 ? 'option' : 'options'}`;
    }

    case 'send_template':
      return str(config, 'name') ? `${str(config, 'name')} · ${str(config, 'language')}` : 'No template selected';

    case 'carousel': {
      const n = count(config, 'cards');
      return `Carousel · ${n} ${n === 1 ? 'card' : 'cards'}`;
    }

    case 'ask_question': {
      const type = str(config, 'inputType') || 'text';
      const variable = str(config, 'variable');
      const question = truncate(str(config, 'question'), 44);
      return `${question}${variable ? ` → {{${variable}}}` : ''} (${type})`;
    }

    case 'request_location':
      return truncate(str(config, 'prompt')) || 'Ask for a location';

    case 'webview':
      return str(config, 'title') ? `${str(config, 'title')} · webview` : 'Open a web page';

    case 'condition': {
      const operator = str(config, 'operator').replace(/_/g, ' ');
      return `${str(config, 'variable')} ${operator} ${str(config, 'value')}`.trim();
    }

    case 'jump':
      return str(config, 'target') ? `Go to ${str(config, 'target')}` : 'No destination set';

    case 'delay': {
      const amount = num(config, 'amount') ?? 0;
      const unit = str(config, 'unit') || 'minutes';
      return `Wait ${amount} ${unit}`;
    }

    case 'set_variable':
      return `{{${str(config, 'variable')}}} = ${str(config, 'value')}`;

    case 'global_keyword': {
      const keywords = Array.isArray(config.keywords) ? (config.keywords as string[]) : [];
      return keywords.length ? `Catch: ${keywords.join(', ')}` : 'No keywords yet';
    }

    case 'ab_test':
      return `Split ${num(config, 'split') ?? 50}% / ${100 - (num(config, 'split') ?? 50)}%`;

    case 'webhook': {
      const url = str(config, 'url');
      let host = url;
      try {
        host = url ? new URL(url).host : url;
      } catch {
        host = url;
      }
      return `${str(config, 'method')} ${truncate(host, 34)}`.trim();
    }

    case 'app_integration': {
      const app = str(config, 'app').replace(/_/g, ' ');
      return `${capitalise(app)} · ${str(config, 'action')}`;
    }

    case 'send_email':
      return `To ${truncate(str(config, 'to'), 30)} · ${truncate(str(config, 'subject'), 28)}`;

    case 'dynamic_data':
      return truncate(str(config, 'expression')) || 'No expression';

    case 'human_takeover':
      return `Route to ${str(config, 'team') || 'a team'}`;

    case 'business_hours':
      return str(config, 'schedule') || str(config, 'timezone') || 'Working hours';

    case 'close_chat':
      return 'End the conversation';

    case 'inactivity_trigger':
      return `After ${num(config, 'amount') ?? 0} ${str(config, 'unit') || 'minutes'} of silence`;

    case 'sticky_note':
      return truncate(str(config, 'text'), 140) || 'Empty note';

    case 'error_catch':
      return `Retry ${num(config, 'retries') ?? 0}× on failure`;

    default:
      return '';
  }
}

export function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
