import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { certificatePage, certificateSummary } from '../test/fixtures'
import { json, mockFetch, never } from '../test/fetchMock'
import { renderRoute } from '../test/render'

const twoRows = [
  certificateSummary(),
  certificateSummary({
    id: 2,
    serial: 'SYD-2026-000002',
    participantName: 'Bao Nguyễn',
    courseTitle: 'First Aid',
    status: 'revoked',
    // 23:30 on 31 Dec 2026 in Perth would be 1 Jan 2027 in Sydney: 15:30 UTC → 02:30 AEDT
    issuedAt: '2026-12-31T15:30:00.000Z',
    revokedAt: '2027-01-02T00:00:00.000Z',
  }),
]

function bodyRows() {
  return within(screen.getByRole('table', { name: 'Certificates' })).getAllByRole('row').slice(1)
}

describe('CertificateListPage', () => {
  it('shows a loading state while the first page loads', async () => {
    mockFetch(() => never())
    renderRoute('/certificates')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading certificates…')
  })

  it('lists certificates with dates in the response’s time zone', async () => {
    const { requests } = mockFetch(() => json(certificatePage(twoRows)))
    renderRoute('/certificates')

    await screen.findByRole('table', { name: 'Certificates' })
    const rows = bodyRows()
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'SYD-2026-000001',
      "Ana O'Neil",
      'Workplace Safety',
      '1 Jan 2026', // 13:30 UTC on 31 Dec 2025 is New Year's Day in Sydney
      'Valid',
    ])
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'SYD-2026-000002',
      'Bao Nguyễn',
      'First Aid',
      '1 Jan 2027',
      'Revoked',
    ])

    expect(requests).toHaveLength(1)
    expect(requests[0].url.pathname).toBe('/api/certificates')
    expect(requests[0].url.searchParams.get('page')).toBe('1')
    expect(requests[0].headers.tenant_id).toBe('SYD')
  })

  it('formats dates in the zone the API sends, not a fixed one', async () => {
    mockFetch(() => json(certificatePage(twoRows, { timezone: 'Australia/Perth' })))
    renderRoute('/certificates')
    await screen.findByRole('table')
    expect(within(bodyRows()[1]).getAllByRole('cell')[3]).toHaveTextContent('31 Dec 2026')
  })

  it('links each serial to the certificate’s detail page', async () => {
    mockFetch((req) =>
      req.url.pathname === '/api/certificates' ? json(certificatePage(twoRows)) : never(),
    )
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates')
    await user.click(await screen.findByRole('link', { name: 'SYD-2026-000002' }))
    expect(router.state.location.pathname).toBe('/certificates/2')
  })

  it('shows the empty state when there are no certificates', async () => {
    mockFetch(() => json(certificatePage([])))
    renderRoute('/certificates')
    expect(await screen.findByText('No certificates yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bulk issue certificates' })).toHaveAttribute('href', '/bulk-issue')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    let calls = 0
    const { requests } = mockFetch(() => {
      calls += 1
      return calls === 1
        ? json({ error: 'internal_error', message: 'Something went wrong on the server' }, 500)
        : json(certificatePage(twoRows))
    })
    const user = userEvent.setup()
    renderRoute('/certificates')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load certificates')
    expect(alert).toHaveTextContent('Something went wrong on the server')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(requests).toHaveLength(2)
  })

  it('shows a network error in words', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    renderRoute('/certificates')
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server')
  })

  it('reads the page from the URL', async () => {
    const { requests } = mockFetch(() => json(certificatePage(twoRows, { page: 2, total: 22 })))
    renderRoute('/certificates?page=2')
    expect(await screen.findByText('21–22 of 22')).toBeInTheDocument()
    expect(requests[0].url.searchParams.get('page')).toBe('2')
  })

  it.each(['0', '-1', 'abc', '1.5'])('treats ?page=%s as page 1', async (value) => {
    const { requests } = mockFetch(() => json(certificatePage(twoRows)))
    renderRoute(`/certificates?page=${value}`)
    await screen.findByRole('table')
    expect(requests[0].url.searchParams.get('page')).toBe('1')
  })

  it('pages with Next and Previous, keeping the page in the URL', async () => {
    const pageOne = Array.from({ length: 20 }, (_, i) =>
      certificateSummary({ id: i + 1, serial: `SYD-2026-${String(i + 1).padStart(6, '0')}` }),
    )
    const pageTwo = [certificateSummary({ id: 21, serial: 'SYD-2026-000021' })]
    let releasePageTwo: () => void = () => {}
    const { requests } = mockFetch((req) => {
      if (req.url.searchParams.get('page') === '2') {
        return new Promise((resolve) => {
          releasePageTwo = () => resolve(json(certificatePage(pageTwo, { page: 2, total: 21 })))
        })
      }
      return json(certificatePage(pageOne, { total: 21 }))
    })
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates')

    expect(await screen.findByText('1–20 of 21')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(router.state.location.search).toBe('?page=2')

    // While page 2 loads, page 1 stays on screen, marked busy, with paging disabled
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(bodyRows()).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    releasePageTwo()
    expect(await screen.findByText('21–21 of 21')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy')

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('1–20 of 21')).toBeInTheDocument()
    // Page 1 comes back from the cache (the test client may also refresh it in the background)
    expect(requests.slice(0, 2).map((r) => r.url.searchParams.get('page'))).toEqual(['1', '2'])
  })

  it('offers the first page when the URL is past the end', async () => {
    mockFetch((req) =>
      req.url.searchParams.get('page') === '9'
        ? json(certificatePage([], { page: 9, total: 2 }))
        : json(certificatePage(twoRows)),
    )
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates?page=9')

    expect(await screen.findByText('No certificates on page 9')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shows an error when the response doesn’t match the contract', async () => {
    mockFetch(() => json({ items: 'nope' }))
    renderRoute('/certificates')
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t understand')
  })
})
