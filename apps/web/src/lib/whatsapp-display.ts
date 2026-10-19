/**
 * Presentation helpers for the templates view.
 *
 * Pure data + formatting only — no React, so the same labels can be reused
 * wherever templates are rendered.
 */

import type { TemplateCategory, TemplateStatus } from '@/lib/mock/templates';

export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Authentication',
};

export const TEMPLATE_STATUS_LABEL: Record<TemplateStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  paused: 'Paused',
};

const LANGUAGE_LABEL: Record<string, string> = {
  en_US: 'English (US)',
  en_GB: 'English (UK)',
  sw: 'Swahili',
  fr: 'French',
  es: 'Spanish',
  pt_BR: 'Portuguese (BR)',
  ar: 'Arabic',
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABEL[code] ?? code;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Locale-independent date, e.g. "16 Oct 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
