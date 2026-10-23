import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TENANT_STORAGE_KEY } from '../../api/tenant'
import { certificatePage, certificateSummary } from '../../test/fixtures'
import { json, mockFetch, never, type MockRequest } from '../../test/fetchMock'
import { createTestQueryClient, renderRoute, TENANTS } from '../../test/render'

const sydneyRow = certificateSummary({ id: 1, serial: 'SYD-2026-000001', participantName: "Ana O'Neil" })
const perthRow = certificateSummary({ id: 1, serial: 'PER-2026-000001', participantName: 'Mia Chen' })

/**
 * A two-database API: answers by the `tenant_id` header, like the real one (spec §5.1).
 * Perth's list can be held back to look at the page while it loads.
 */
function tenantApi({ holdPerth = false } = {}) {
  const requests: MockRequest[] = []
  let releasePerth: () => void = () => {}
  mockFetch((req) => {
    requests.push(req)
    const tenant = req.headers.tenant_id
    if (req.url.pathname === '/api/tenants') return json({ items: TENANTS })
    if (req.url.pathname === '/api/courses') return json({ items: [] })
    if (req.url.pathname === '/api/certificates') {
      if (tenant === 'PER') {
        const page = json(certificatePage([perthRow], { timezone: 'Australia/Perth' }))
        return holdPerth ? new Promise((resolve) => (releasePerth = () => resolve(page))) : page
      }
      if (tenant === 'SYD') return json(certificatePage([sydneyRow]))
      return json({ error: 'unknown_tenant', message: 'Unknown tenant' }, 400)
    }
    return never()
  })
  return { requests, releasePerth: () => releasePerth() }
}

const tenantSelect = () => screen.getByRole('combobox', { name: 'Tenant' })

describe('TenantProvider and switcher', () => {
  it('loads the tenants without a tenant header and selects the first by default', async () => {
    const { requests } = tenantApi()
    renderRoute('/certificates', createTestQueryClient(), { tenants: null })

    expect(screen.getByRole('status')).toHaveTextContent('Loading tenants…')
    await screen.findByRole('table')
    expect(tenantSelect()).toHaveValue('SYD')
    expect(within(tenantSelect()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sydney',
      'Perth',
      'Adelaide',
    ])

    const tenantsCall = requests.find((r) => r.url.pathname === '/api/tenants')!
    expect(tenantsCall.headers).not.toHaveProperty('tenant_id')
    // Nothing tenant-scoped was fetched before the tenant was known
    expect(requests[0].url.pathname).toBe('/api/tenants')
    expect(requests.find((r) => r.url.pathname === '/api/certificates')!.headers.tenant_id).toBe('SYD')
  })

  it('selects the remembered tenant', async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, 'PER')
    const { requests } = tenantApi()
    renderRoute('/certificates')
    expect(await screen.findByText('PER-2026-000001')).toBeInTheDocument()
    expect(tenantSelect()).toHaveValue('PER')
    expect(requests.every((r) => r.headers.tenant_id === 'PER')).toBe(true)
  })

  it('falls back to the first tenant when the remembered one is gone', async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, 'HBA')
    tenantApi()
    renderRoute('/certificates')
    expect(await screen.findByText('SYD-2026-000001')).toBeInTheDocument()
    expect(tenantSelect()).toHaveValue('SYD')
  })

  it('works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    tenantApi()
    const user = userEvent.setup()
    renderRoute('/certificates')
    await screen.findByText('SYD-2026-000001')
    await user.selectOptions(tenantSelect(), 'Perth')
    expect(await screen.findByText('PER-2026-000001')).toBeInTheDocument()
  })

  it('switches tenant: other data, remembered choice, back to the list, no flash of the previous tenant', async () => {
    const api = tenantApi({ holdPerth: true })
    const queryClient = createTestQueryClient()
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates?q=ana&page=2', queryClient)
    await screen.findByText('SYD-2026-000001')

    await user.selectOptions(tenantSelect(), 'Perth')

    // Straight back to an unfiltered list, loading Perth: Sydney's rows are gone at once
    expect(router.state.location.pathname).toBe('/certificates')
    expect(router.state.location.search).toBe('')
    expect(screen.queryByText('SYD-2026-000001')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Loading certificates…')
    expect(screen.getByRole('searchbox')).toHaveValue('')

    // No Sydney data is left in the cache
    const keys = queryClient.getQueryCache().getAll().map((q) => q.queryKey)
    expect(keys.filter((k) => k[1] === 'SYD')).toEqual([])

    api.releasePerth()
    expect(await screen.findByText('PER-2026-000001')).toBeInTheDocument()
    expect(screen.queryByText('SYD-2026-000001')).not.toBeInTheDocument()
    expect(tenantSelect()).toHaveValue('PER')
    expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe('PER')
    const perthCalls = api.requests.filter((r) => r.headers.tenant_id === 'PER')
    expect(perthCalls.map((r) => r.url.pathname)).toEqual(expect.arrayContaining(['/api/certificates', '/api/courses']))
  })

  it('switching back shows the first tenant’s data again, fetched fresh', async () => {
    const api = tenantApi()
    const user = userEvent.setup()
    renderRoute('/certificates')
    await screen.findByText('SYD-2026-000001')
    await user.selectOptions(tenantSelect(), 'Perth')
    await screen.findByText('PER-2026-000001')
    const before = api.requests.filter((r) => r.headers.tenant_id === 'SYD' && r.url.pathname === '/api/certificates').length

    await user.selectOptions(tenantSelect(), 'Sydney')
    expect(await screen.findByText('SYD-2026-000001')).toBeInTheDocument()
    const after = api.requests.filter((r) => r.headers.tenant_id === 'SYD' && r.url.pathname === '/api/certificates').length
    expect(after).toBe(before + 1)
  })

  it('returns to the list from any page', async () => {
    tenantApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/audit')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Tenant' }), 'Adelaide')
    expect(router.state.location.pathname).toBe('/certificates')
  })

  it('shows an error with retry when tenants can’t be loaded', async () => {
    let calls = 0
    mockFetch((req) => {
      if (req.url.pathname === '/api/tenants') {
        calls += 1
        return calls === 1 ? json({ error: 'internal_error', message: 'Boom' }, 500) : json({ items: TENANTS })
      }
      if (req.url.pathname === '/api/certificates') return json(certificatePage([sydneyRow]))
      return json({ items: [] })
    })
    const user = userEvent.setup()
    renderRoute('/certificates', createTestQueryClient(), { tenants: null })
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load tenants')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('SYD-2026-000001')).toBeInTheDocument()
  })

  it('says so when there are no tenants', async () => {
    mockFetch(() => json({ items: [] }))
    renderRoute('/certificates', createTestQueryClient(), { tenants: null })
    expect(await screen.findByText('No tenants are set up')).toBeInTheDocument()
  })

  it('choosing the current tenant again changes nothing', async () => {
    tenantApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/audit')
    await screen.findByRole('combobox', { name: 'Tenant' })
    await user.selectOptions(tenantSelect(), 'Sydney')
    expect(router.state.location.pathname).toBe('/audit')
  })

  it('remembers the choice for the next visit', async () => {
    tenantApi()
    const user = userEvent.setup()
    const first = renderRoute('/certificates')
    await screen.findByText('SYD-2026-000001')
    await user.selectOptions(tenantSelect(), 'Perth')
    await screen.findByText('PER-2026-000001')
    first.unmount()

    renderRoute('/certificates')
    expect(await screen.findByText('PER-2026-000001')).toBeInTheDocument()
    await waitFor(() => expect(tenantSelect()).toHaveValue('PER'))
  })
})
