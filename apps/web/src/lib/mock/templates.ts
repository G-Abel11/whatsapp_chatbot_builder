/** Mock WhatsApp message templates (View C · Template Manager). */

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateStatus = 'approved' | 'pending' | 'rejected' | 'paused';

export interface WhatsAppTemplate {
  id: string;
  tenantId: string;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  header?: string;
  body: string;
  footer?: string;
  buttons: string[];
  updatedAt: string;
}

export const MOCK_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl_001',
    tenantId: 'ten_acme',
    name: 'order_confirmation',
    category: 'UTILITY',
    language: 'en_US',
    status: 'approved',
    header: 'Order {{1}} confirmed',
    body: 'Hi {{1}}, your order {{2}} is confirmed and will arrive by {{3}}.',
    footer: 'Acme Retail',
    buttons: ['Track order', 'Talk to us'],
    updatedAt: '2026-10-14T09:12:00.000Z',
  },
  {
    id: 'tpl_002',
    tenantId: 'ten_acme',
    name: 'abandoned_cart_reminder',
    category: 'MARKETING',
    language: 'en_US',
    status: 'approved',
    header: 'Still thinking it over?',
    body: 'Hi {{1}}, the {{2}} you left in your cart is almost gone. Complete your order in one tap.',
    buttons: ['Complete order'],
    updatedAt: '2026-10-12T16:40:00.000Z',
  },
  {
    id: 'tpl_003',
    tenantId: 'ten_acme',
    name: 'appointment_reminder',
    category: 'UTILITY',
    language: 'en_GB',
    status: 'pending',
    body: 'Reminder: your appointment with {{1}} is on {{2}} at {{3}}.',
    buttons: ['Confirm', 'Reschedule'],
    updatedAt: '2026-10-16T11:05:00.000Z',
  },
  {
    id: 'tpl_004',
    tenantId: 'ten_acme',
    name: 'launch_promo_swahili',
    category: 'MARKETING',
    language: 'sw',
    status: 'rejected',
    body: 'Habari {{1}}! Punguzo la 30% kwa bidhaa zote leo tu.',
    buttons: ['Nunua sasa'],
    updatedAt: '2026-10-10T08:30:00.000Z',
  },
  {
    id: 'tpl_005',
    tenantId: 'ten_acme',
    name: 'login_verification',
    category: 'AUTHENTICATION',
    language: 'en_US',
    status: 'approved',
    body: '{{1}} is your verification code. For your security, do not share this code.',
    buttons: [],
    updatedAt: '2026-09-28T07:15:00.000Z',
  },
  {
    id: 'tpl_006',
    tenantId: 'ten_acme',
    name: 'reengagement_offer',
    category: 'MARKETING',
    language: 'en_US',
    status: 'paused',
    body: 'We miss you {{1}} — here is 15% off your next order with code {{2}}.',
    buttons: ['Shop now'],
    updatedAt: '2026-09-19T13:22:00.000Z',
  },
];
