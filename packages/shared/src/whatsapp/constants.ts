/**
 * Hard WhatsApp Cloud API constraints. The UI must enforce these visually;
 * the execution engine must enforce them authoritatively.
 */

/** Customers can only be messaged freely for 24h after their last message. */
export const FREE_MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Interactive reply buttons: max 3 (title <= 20 chars, button id <= 256). */
export const MAX_INTERACTIVE_BUTTONS = 3;
export const MAX_BUTTON_TITLE_CHARS = 20;
export const MAX_BUTTON_ID_CHARS = 256;

/** List rows: max 10 (section title <= 24 chars, row title <= 24 chars). */
export const MAX_LIST_ROWS = 10;
export const MAX_LIST_SECTIONS = 10;
export const MAX_ROW_TITLE_CHARS = 24;

/** Body text limits. */
export const MAX_TEXT_LENGTH = 1024;
export const MAX_CAPTION_LENGTH = 1024;

/** Media size ceilings (bytes) per Cloud API. */
export const MAX_MEDIA_BYTES = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
} as const;

/** Free-form text replies are only possible inside the 24h window. */
export type WindowFriendlyKind = 'free_form' | 'template';

export function remainingWindowMs(lastInboundAt: number, now = Date.now()): number {
  return Math.max(0, lastInboundAt + FREE_MESSAGE_WINDOW_MS - now);
}

export function crossesWindow(elapsedMs: number, additionalDelayMs: number): boolean {
  return elapsedMs + additionalDelayMs > FREE_MESSAGE_WINDOW_MS;
}
