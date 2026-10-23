import { NavLink, Outlet } from 'react-router'

const navItems = [
  { to: '/certificates', label: 'Certificates' },
  { to: '/bulk-issue', label: 'Bulk issue' },
  { to: '/audit', label: 'Audit log' },
]

export function Layout() {
  return (
    <div className="app">
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
        <span className="app-user">admin</span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
