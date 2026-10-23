import { createContext, useContext } from 'react'
import type { Tenant } from '@cert/shared'

export interface TenantContextValue {
  tenant: Tenant
  tenants: Tenant[]
  switchTenant: (code: string) => void
}

export const TenantContext = createContext<TenantContextValue | null>(null)

/** The selected tenant. Only usable inside `TenantProvider`. */
export function useTenant(): TenantContextValue {
  const value = useContext(TenantContext)
  if (!value) throw new Error('useTenant must be used inside TenantProvider')
  return value
}
