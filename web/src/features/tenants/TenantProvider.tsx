import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { loadStoredTenantCode, setCurrentTenantCode, storeTenantCode } from '../../api/tenant'
import { EmptyState, ErrorState, LoadingState } from '../../components/states'
import { pickTenant, tenantKeys, useTenants } from './api'
import { TenantContext, type TenantContextValue } from './context'

/**
 * Loads the tenants, selects one (the remembered one, else the first) and renders the app for
 * it. Nothing tenant-scoped renders, or fetches, before a tenant is selected.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const tenants = useTenants()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<string | null>(() => loadStoredTenantCode())

  const tenant = tenants.data ? pickTenant(tenants.data, chosen) : undefined
  // The API client and query keys read the code synchronously, so set it before children render
  setCurrentTenantCode(tenant?.code ?? null)

  const switchTenant = useCallback(
    (code: string) => {
      if (code === tenant?.code || !tenants.data?.some((t) => t.code === code)) return
      // Drop everything of the previous tenant (except the tenant list) so none of it can show
      void queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== tenantKeys.all[0] })
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== tenantKeys.all[0] })
      setCurrentTenantCode(code)
      storeTenantCode(code)
      setChosen(code)
      navigate('/certificates')
    },
    [navigate, queryClient, tenant?.code, tenants.data],
  )

  const value = useMemo<TenantContextValue | null>(
    () => (tenant && tenants.data ? { tenant, tenants: tenants.data, switchTenant } : null),
    [tenant, tenants.data, switchTenant],
  )

  if (tenants.isPending) return <LoadingState label="Loading tenants…" />
  if (tenants.isError && !tenants.data) {
    return (
      <ErrorState
        title="Couldn’t load tenants"
        error={tenants.error}
        onRetry={() => void tenants.refetch()}
        retrying={tenants.isFetching}
      />
    )
  }
  if (!value) return <EmptyState title="No tenants are set up" description="Add a tenant to the registry first." />

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}
