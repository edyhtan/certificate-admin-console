import { useQuery } from '@tanstack/react-query'
import { endpoints, tenantListResponseSchema, type Tenant } from '@cert/shared'
import { apiFetch } from '../../api/client'

/** The tenant list is the only query not scoped to a tenant. */
export const tenantKeys = {
  all: ['tenants'] as const,
}

export function fetchTenants(signal?: AbortSignal) {
  return apiFetch(endpoints.listTenants.path, { schema: tenantListResponseSchema, signal, tenant: false })
}

/** Tenants come from a registry in code (D27) and don't change while the app runs. */
export function useTenants() {
  return useQuery({
    queryKey: tenantKeys.all,
    queryFn: ({ signal }) => fetchTenants(signal),
    select: (data) => data.items,
    staleTime: Infinity,
  })
}

/** The remembered tenant if it still exists, else the first one (M3.T5). */
export function pickTenant(tenants: Tenant[], stored: string | null): Tenant | undefined {
  return tenants.find((t) => t.code === stored) ?? tenants[0]
}
