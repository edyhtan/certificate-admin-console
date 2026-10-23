/** Request header that selects the tenant (spec §5.1). */
export const TENANT_HEADER = 'tenant_id'

/**
 * M1–M2 run single-tenant as Sydney (D48), so the client always sends `SYD`. The API ignores
 * the header until M3, when M3.T5 replaces this with the tenant picked in the header.
 */
export const DEFAULT_TENANT_CODE = 'SYD'

export function currentTenantCode(): string {
  return DEFAULT_TENANT_CODE
}
