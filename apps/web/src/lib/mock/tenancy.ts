/**
 * Mock tenancy + flow fixtures.
 *
 * In the backend phase these become real API responses; the shapes here mirror
 * the tenant-scoped tables (every record carries a tenantId).
 */

export interface Tenant {
  id: string;
  name: string;
  plan: 'starter' | 'growth' | 'pro';
  primaryNumber: string;
}

export interface FlowSummary {
  id: string;
  tenantId: string;
  title: string;
  status: 'draft' | 'live';
  version: number;
  updatedAt: string;
}

export const MOCK_TENANTS: Tenant[] = [
  { id: 'ten_acme', name: 'Acme Retail', plan: 'pro', primaryNumber: '+254 712 000 111' },
  { id: 'ten_zenith', name: 'Zenith Clinics', plan: 'growth', primaryNumber: '+254 700 880 200' },
];

export const MOCK_FLOWS: FlowSummary[] = [
  {
    id: 'flow_001',
    tenantId: 'ten_acme',
    title: 'Sales Qualification Bot',
    status: 'draft',
    version: 12,
    updatedAt: '2026-10-17T08:24:00.000Z',
  },
  {
    id: 'flow_002',
    tenantId: 'ten_acme',
    title: 'Order Status Lookup',
    status: 'live',
    version: 34,
    updatedAt: '2026-10-11T17:02:00.000Z',
  },
  {
    id: 'flow_003',
    tenantId: 'ten_zenith',
    title: 'Appointment Booking',
    status: 'draft',
    version: 4,
    updatedAt: '2026-10-15T12:40:00.000Z',
  },
];
