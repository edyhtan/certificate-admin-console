import { NavLink, Outlet } from 'react-router'
import { TenantProvider } from '../features/tenants/TenantProvider'
import { TenantSwitcher } from '../features/tenants/TenantSwitcher'
import { useTenant } from '../features/tenants/context'

const navItems = [
  { to: '/certificates', label: 'Certificates' },
  { to: '/bulk-issue', label: 'Bulk issue' },
  { to: '/audit', label: 'Audit log' },
]

function Shell() {
  const { tenant } = useTenant()
  return (
    <>
      <header className="app-header">
        <span className="app-title">Certificate Admin Console</span>
        <nav aria-label="Main">
          <ul className="app-nav">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="app-tenant">
          <TenantSwitcher />
        </div>
        <span className="app-user">admin</span>
      </header>
      <main className="app-main">
        {/* Keyed by tenant: switching starts every page fresh, with no state from the last one */}
        <Outlet key={tenant.code} />
      </main>
    </>
  )
}

export function Layout() {
  return (
    <div className="app">
      <TenantProvider>
        <Shell />
      </TenantProvider>
    </div>
  )
}
