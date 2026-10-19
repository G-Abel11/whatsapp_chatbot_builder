import type { FlowNode } from './types';
import { createFlowNode } from './factory';

/**
 * The starter graph for a brand-new bot.
 *
 * Bots live in the API (see `lib/flow/registry.ts`), which seeds a rich demo
 * flow of its own — this is only what you get on an empty canvas, so the
 * builder never opens completely blank.
 */

export function createStarterNodes(title: string): FlowNode[] {
  const name = title.trim() || 'our WhatsApp bot';
  return [
    createFlowNode('send_text', { x: 0, y: 0 }, {
      config: { text: `Hi 👋 Welcome to ${name}. How can we help today?` },
    }),
  ];
}
