/** Mock connected WhatsApp numbers + tenant health (View C · Tenant Health). */

export type QualityRating = 'green' | 'yellow' | 'red';
export type DisplayNameStatus = 'approved' | 'pending' | 'rejected';

export type MessagingLimitTier = '250' | '1K' | '10K' | '100K' | 'UNLIMITED';

export interface ConnectedPhoneNumber {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  displayNumber: string;
  verifiedName: string;
  displayNameStatus: DisplayNameStatus;
  qualityRating: QualityRating;
  messagingLimit: MessagingLimitTier;
  /** Messages sent in the current 24h window. */
  sentToday: number;
  wabaName: string;
  connectedAt: string;
}

export const MOCK_PHONE_NUMBERS: ConnectedPhoneNumber[] = [
  {
    id: 'pn_001',
    tenantId: 'ten_acme',
    phoneNumberId: '102938475610293',
    displayNumber: '+254 712 000 111',
    verifiedName: 'Acme Retail',
    displayNameStatus: 'approved',
    qualityRating: 'green',
    messagingLimit: '10K',
    sentToday: 1842,
    wabaName: 'Acme Retail WABA',
    connectedAt: '2026-06-02T10:00:00.000Z',
  },
  {
    id: 'pn_002',
    tenantId: 'ten_acme',
    phoneNumberId: '102938475610294',
    displayNumber: '+254 712 000 222',
    verifiedName: 'Acme Support',
    displayNameStatus: 'pending',
    qualityRating: 'yellow',
    messagingLimit: '1K',
    sentToday: 860,
    wabaName: 'Acme Retail WABA',
    connectedAt: '2026-09-21T14:30:00.000Z',
  },
  {
    id: 'pn_003',
    tenantId: 'ten_acme',
    phoneNumberId: '102938475610295',
    displayNumber: '+254 733 555 909',
    verifiedName: 'Acme Deliveries',
    displayNameStatus: 'rejected',
    qualityRating: 'red',
    messagingLimit: '250',
    sentToday: 249,
    wabaName: 'Acme Logistics WABA',
    connectedAt: '2026-10-05T08:45:00.000Z',
  },
];
