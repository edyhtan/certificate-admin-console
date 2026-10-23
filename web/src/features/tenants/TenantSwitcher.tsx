import { useTenant } from './context'

/** Header control to change tenant. Switching clears cached data and returns to the list. */
export function TenantSwitcher() {
  const { tenant, tenants, switchTenant } = useTenant()
  return (
    <label className="tenant-switcher">
      <span className="visually-hidden">Tenant</span>
      <select aria-label="Tenant" value={tenant.code} onChange={(event) => switchTenant(event.target.value)}>
        {tenants.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  )
}
