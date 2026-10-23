import { z } from 'zod';
import { timeZoneSchema } from './common.js';

/**
 * Request header that selects the tenant (spec §5.1, D24). Sent on every route except
 * `GET /api/tenants` and `GET /api/health`. Ignored by the API until M3, but the web app
 * sends it from M1 (`SYD` until M3, D48).
 */
export const TENANT_HEADER = 'tenant_id';

/** A tenant code: 3 upper-case letters, also the serial prefix, e.g. `SYD`. */
export const tenantCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, { error: 'must be 3 upper-case letters' });
export type TenantCode = z.output<typeof tenantCodeSchema>;

/** Public tenant info. Database names never leave the API (D27). */
export const tenantSchema = z.object({
  code: tenantCodeSchema,
  name: z.string(),
  timezone: timeZoneSchema,
});
export type Tenant = z.output<typeof tenantSchema>;

/** `GET /api/tenants` */
export const tenantListResponseSchema = z.object({
  items: z.array(tenantSchema),
});
export type TenantListResponse = z.output<typeof tenantListResponseSchema>;
