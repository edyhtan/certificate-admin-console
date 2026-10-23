import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TENANT_STORAGE_KEY } from '../../api/tenant'
import { auditEvent, auditPage, certificateDetail, certificatePage, certificateSummary } from '../../test/fixtures'
import { json, mockFetch, never } from '../../test/fetchMock'
import { renderRoute } from '../../test/render'

const ZONES: Record<string, string> = {
  SYD: 'Australia/Sydney',
  PER: 'Australia/Perth',
  ADL: 'Australia/Adelaide',
}

/** Seeded edge-case certificates per tenant (spec §4, §7 seed). */
const SEED = {
  PER: [
    // 23:30 on New Year's Eve in Perth (UTC+8) is 15:30 UTC: still 31 Dec locally
    certificateSummary({ id: 1, serial: 'PER-2026-000001', issuedAt: '2026-12-31T15:30:00.000Z' }),
  ],
  SYD: [
    // Either side of the end of daylight saving, 5 Apr 2026 (03:00 AEDT → 02:00 AEST)
    certificateSummary({ id: 3, serial: 'SYD-2026-000003', issuedAt: '2026-04-04T15:30:00.000Z' }),
    certificateSummary({ id: 4, serial: 'SYD-2026-000004', issuedAt: '2026-04-04T16:30:00.000Z' }),
    // Either side of the start of daylight saving, 4 Oct 2026 (02:00 AEST → 03:00 AEDT)
    certificateSummary({ id: 5, serial: 'SYD-2026-000005', issuedAt: '2026-10-03T15:30:00.000Z' }),
    certificateSummary({ id: 6, serial: 'SYD-2026-000006', issuedAt: '2026-10-03T16:30:00.000Z' }),
    // 00:30 on 1 Jan 2026 in Sydney is still 2025 in UTC
    certificateSummary({ id: 1, serial: 'SYD-2026-000001', issuedAt: '2025-12-31T13:30:00.000Z' }),
  ],
  ADL: [
    // Adelaide (UTC+9:30 / +10:30): either side of 4 Oct 2026, 02:00 ACST → 03:00 ACDT
    certificateSummary({ id: 7, serial: 'ADL-2026-000007', issuedAt: '2026-10-03T16:15:00.000Z' }),
    certificateSummary({ id: 8, serial: 'ADL-2026-000008', issuedAt: '2026-10-03T16:45:00.000Z' }),
  ],
} as const

/** Answers per tenant header, with that tenant's zone, like the per-tenant databases. */
function zonedApi() {
  return mockFetch((req) => {
    const code = req.headers.tenant_id as keyof typeof SEED
    const timezone = ZONES[code]
    const items = SEED[code]
    const detail = /^\/api\/certificates\/(\d+)$/.exec(req.url.pathname)
    if (req.url.pathname === '/api/courses') return json({ items: [] })
    if (req.url.pathname === '/api/certificates') return json(certificatePage([...items], { timezone }))
    if (detail) {
      const found = items.find((c) => c.id === Number(detail[1]))
      return found ? json(certificateDetail({ ...found, timezone })) : json({ error: 'not_found', message: 'Certificate not found' }, 404)
    }
    if (req.url.pathname === '/api/audit-events') {
      return json(auditPage(items.map((c) => auditEvent({ id: c.id, occurredAt: c.issuedAt, serial: c.serial, certificateId: c.id })), { timezone }))
    }
    return never()
  })
}

function issueDates() {
  const table = screen.getByRole('table', { name: 'Certificates' })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => {
      const cells = within(row).getAllByRole('cell')
      return `${cells[0].textContent} ${cells[3].textContent}`
    })
}

function detailValue(term: string) {
  return screen.getByText(term, { selector: 'dt' }).nextElementSibling?.textContent
}

afterEach(() => {
  vi.useRealTimers()
})

describe('tenant time zones (M3.T6)', () => {
  it('shows the tenant and its zone in the header, following the switch', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    zonedApi()
    const user = userEvent.setup()
    renderRoute('/certificates')

    expect(await screen.findByText('Sydney · AEST UTC+10')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tenant' }), 'Perth')
    expect(await screen.findByText('Perth · AWST UTC+8')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tenant' }), 'Adelaide')
    expect(await screen.findByText('Adelaide · ACST UTC+9:30')).toBeInTheDocument()
  })

  it('shows daylight time in the header in summer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
    zonedApi()
    renderRoute('/certificates')
    expect(await screen.findByText('Sydney · AEDT UTC+11')).toBeInTheDocument()
  })

  it('shows the Perth New Year’s Eve certificate on 31 Dec 2026, in the list and the detail', async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, 'PER')
    zonedApi()
    const user = userEvent.setup()
    renderRoute('/certificates')

    await screen.findByRole('table')
    expect(issueDates()).toEqual(['PER-2026-000001 31 Dec 2026'])

    await user.click(screen.getByRole('link', { name: 'PER-2026-000001' }))
    await screen.findByRole('heading', { level: 1, name: 'PER-2026-000001' })
    expect(detailValue('Issued')).toBe('31 Dec 2026, 23:30 AWST')
    expect(screen.getByText('Times are in Australia/Perth.')).toBeInTheDocument()
  })

  it('shows Sydney’s daylight-saving edge certificates at the right local times', async () => {
    zonedApi()
    renderRoute('/certificates')
    await screen.findByRole('table')
    expect(issueDates()).toEqual([
      'SYD-2026-000003 5 Apr 2026',
      'SYD-2026-000004 5 Apr 2026',
      'SYD-2026-000005 4 Oct 2026',
      'SYD-2026-000006 4 Oct 2026',
      'SYD-2026-000001 1 Jan 2026',
    ])
  })

  it.each([
    [3, '5 Apr 2026, 02:30 AEDT'],
    [4, '5 Apr 2026, 02:30 AEST'],
    [5, '4 Oct 2026, 01:30 AEST'],
    [6, '4 Oct 2026, 03:30 AEDT'],
    [1, '1 Jan 2026, 00:30 AEDT'],
  ])('Sydney certificate %i is shown as %s', async (id, expected) => {
    zonedApi()
    renderRoute(`/certificates/${id}`)
    await waitFor(() => expect(detailValue('Issued')).toBe(expected))
  })

  it.each([
    [7, '4 Oct 2026, 01:45 ACST'],
    [8, '4 Oct 2026, 03:15 ACDT'],
  ])('Adelaide certificate %i is shown as %s', async (id, expected) => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, 'ADL')
    zonedApi()
    renderRoute(`/certificates/${id}`)
    await waitFor(() => expect(detailValue('Issued')).toBe(expected))
  })

  it('shows audit log times in the tenant’s zone', async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, 'PER')
    zonedApi()
    renderRoute('/audit')
    const table = await screen.findByRole('table', { name: 'Audit events' })
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('31 Dec 2026, 23:30 AWST')
  })
})

describe('no browser-zone date formatting', () => {
  // Every date on screen goes through lib/dates.ts with an explicit zone. Anything that formats
  // or reads calendar fields from a Date directly would use the browser's zone instead.
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
  const forbidden = /\.toLocale(Date|Time)?String\(|\.get(FullYear|Month|Date|Day|Hours|Minutes)\(|new Intl\.DateTimeFormat\(/

  it.each(
    Object.entries(sources).filter(([path]) => !path.endsWith('.spec.ts') && !path.endsWith('.spec.tsx') && path !== '/src/lib/dates.ts'),
  )('%s formats no dates itself', (_path, source) => {
    expect(source).not.toMatch(forbidden)
  })

  it('found the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })
})
