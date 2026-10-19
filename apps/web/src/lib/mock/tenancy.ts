/**
 * Tenancy fixtures.
 *
 * The API has no tenant endpoints yet — every flow carries a `tenantId` that
 * defaults to `tenant_default` — so this is display-only decoration used to
 * label rows and the workspace switcher. Bots live in the backend (see
 * `lib/flow/registry.ts`).
 */

export interface Tenant {
  id: string;
  name: string;
  plan: 'starter' | 'growth' | 'pro';
  primaryNumber: string;
}

export const MOCK_TENANTS: Tenant[] = [
  { id: 'ten_acme', name: 'Acme Retail', plan: 'pro', primaryNumber: '+254 712 000 111' },
  { id: 'ten_zenith', name: 'Zenith Clinics', plan: 'growth', primaryNumber: '+254 700 880 200' },
];
