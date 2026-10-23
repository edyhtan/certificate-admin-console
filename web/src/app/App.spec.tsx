import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import type { HealthReport } from '@cert/shared'
import { App } from './App'
import { routes } from './routes'
import { json, mockFetch } from '../test/fetchMock'
import { certificatePage, certificateSummary } from '../test/fixtures'
import { createTestQueryClient } from '../test/render'

const up = { status: 'up', durationMs: 1 } as const
const down = { status: 'down', durationMs: 2000 } as const
const ok: HealthReport = { status: 'ok', checks: { database: up, admin: up } }
const databaseDown: HealthReport = { status: 'error', checks: { database: down, admin: down } }

function renderApp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/certificates'] })
  return render(<App queryClient={createTestQueryClient()} router={router} healthRetryMs={20} />)
}

describe('App', () => {
  it('checks health before showing any page, and no page calls the API until it is ok', async () => {
    let healthy = false
    const { requests } = mockFetch((req) => {
      if (req.url.pathname === '/api/health') return healthy ? json(ok) : json(databaseDown, 503)
      return json(certificatePage([certificateSummary()]))
    })
    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('these checks are down: database, admin')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(requests.every((r) => r.url.pathname === '/api/health')).toBe(true)

    healthy = true
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByText('SYD-2026-000001')).toBeInTheDocument()
    const firstPageCall = requests.findIndex((r) => r.url.pathname === '/api/certificates')
    expect(firstPageCall).toBeGreaterThan(0)
    expect(requests.slice(0, firstPageCall).every((r) => r.url.pathname === '/api/health')).toBe(true)
  })
})
