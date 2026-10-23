import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { certificatePage, certificateSummary } from '../test/fixtures'
import { json, mockFetch, never, type MockHandler, type MockRequest } from '../test/fetchMock'
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

const courses = {
  items: [
    { id: 21, code: 'FA', title: 'First Aid' },
    { id: 22, code: 'WS', title: 'Workplace Safety' },
  ],
}

/** Answers `/api/courses` itself and passes everything else to `handler`; records only those. */
function mockList(handler: MockHandler) {
  const requests: MockRequest[] = []
  mockFetch((req) => {
    if (req.url.pathname === '/api/courses') return json(courses)
    requests.push(req)
    return handler(req)
  })
  return { requests }
}

function bodyRows() {
  return within(screen.getByRole('table', { name: 'Certificates' })).getAllByRole('row').slice(1)
}

describe('CertificateListPage', () => {
  it('shows a loading state while the first page loads', async () => {
    mockList(() => never())
    renderRoute('/certificates')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading certificates…')
  })

  it('lists certificates with dates in the response’s time zone', async () => {
    const { requests } = mockList(() => json(certificatePage(twoRows)))
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
    mockList(() => json(certificatePage(twoRows, { timezone: 'Australia/Perth' })))
    renderRoute('/certificates')
    await screen.findByRole('table')
    expect(within(bodyRows()[1]).getAllByRole('cell')[3]).toHaveTextContent('31 Dec 2026')
  })

  it('links each serial to the certificate’s detail page', async () => {
    mockList((req) =>
      req.url.pathname === '/api/certificates' ? json(certificatePage(twoRows)) : never(),
    )
    const user = userEvent.setup()
    const { router } = renderRoute('/certificates')
    await user.click(await screen.findByRole('link', { name: 'SYD-2026-000002' }))
    expect(router.state.location.pathname).toBe('/certificates/2')
  })

  it('shows the empty state when there are no certificates', async () => {
    mockList(() => json(certificatePage([])))
    renderRoute('/certificates')
    expect(await screen.findByText('No certificates yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bulk issue certificates' })).toHaveAttribute('href', '/bulk-issue')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    let calls = 0
    const { requests } = mockList(() => {
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
    mockList(() => {
      throw new TypeError('Failed to fetch')
    })
    renderRoute('/certificates')
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server')
  })

  it('reads the page from the URL', async () => {
    const { requests } = mockList(() => json(certificatePage(twoRows, { page: 2, total: 22 })))
    renderRoute('/certificates?page=2')
    expect(await screen.findByText('21–22 of 22')).toBeInTheDocument()
    expect(requests[0].url.searchParams.get('page')).toBe('2')
  })

  it.each(['0', '-1', 'abc', '1.5'])('treats ?page=%s as page 1', async (value) => {
    const { requests } = mockList(() => json(certificatePage(twoRows)))
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
    const { requests } = mockList((req) => {
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
    mockList((req) =>
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
    mockList(() => json({ items: 'nope' }))
    renderRoute('/certificates')
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t understand')
  })

  describe('search, filters and sort (M2.T6)', () => {
    function lastListQuery(requests: MockRequest[]) {
      return Object.fromEntries(requests.at(-1)!.url.searchParams)
    }

    it('searches after typing pauses, not on every key, and resets to page 1', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows)))
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates?page=3')
      await screen.findByRole('table')

      await user.type(screen.getByRole('searchbox', { name: 'Search certificates' }), 'nguy')
      await waitFor(() => expect(router.state.location.search).toBe('?q=nguy'))
      await waitFor(() => expect(lastListQuery(requests)).toEqual({ q: 'nguy', sort: 'issued_at', order: 'desc', page: '1' }))
      // One request for the first page, one for the settled search: none per keystroke
      expect(requests.map((r) => r.url.searchParams.get('q'))).toEqual([null, 'nguy'])
    })

    it('restores search, filters, sort and page from the URL on load', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows, { page: 2, total: 22 })))
      renderRoute('/certificates?q=ana&status=revoked&courseId=22&sort=participant_name&order=desc&page=2')
      await screen.findByRole('table')

      expect(lastListQuery(requests)).toEqual({
        q: 'ana',
        status: 'revoked',
        courseId: '22',
        sort: 'participant_name',
        order: 'desc',
        page: '2',
      })
      expect(screen.getByRole('searchbox')).toHaveValue('ana')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('revoked')
      await waitFor(() => expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('22'))
      expect(screen.getByRole('columnheader', { name: /Participant/ })).toHaveAttribute('aria-sort', 'descending')
    })

    it('ignores values the API would reject', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows)))
      renderRoute('/certificates?sort=password&order=up&status=lost&courseId=abc')
      await screen.findByRole('table')
      expect(lastListQuery(requests)).toEqual({ sort: 'issued_at', order: 'desc', page: '1' })
    })

    it('filters by status and course, resetting to page 1', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows)))
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates?page=2')
      await screen.findByRole('table')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Revoked')
      expect(router.state.location.search).toBe('?status=revoked')
      await waitFor(() => expect(screen.getByRole('option', { name: 'First Aid' })).toBeInTheDocument())
      await user.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'First Aid')
      expect(router.state.location.search).toBe('?status=revoked&courseId=21')
      await waitFor(() =>
        expect(lastListQuery(requests)).toMatchObject({ status: 'revoked', courseId: '21', page: '1' }),
      )

      await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'All')
      expect(router.state.location.search).toBe('?courseId=21')
    })

    it('sorts by a column, flips on a second click, and shows the direction', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows)))
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates')
      await screen.findByRole('table')

      // Default: issue date, newest first
      expect(screen.getByRole('columnheader', { name: /Issue date/ })).toHaveAttribute('aria-sort', 'descending')
      expect(screen.getByRole('columnheader', { name: /Serial/ })).toHaveAttribute('aria-sort', 'none')
      expect(screen.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute('aria-sort')

      await user.click(screen.getByRole('button', { name: /Serial/ }))
      expect(router.state.location.search).toBe('?sort=serial')
      await waitFor(() => expect(lastListQuery(requests)).toMatchObject({ sort: 'serial', order: 'asc' }))
      await waitFor(() =>
        expect(screen.getByRole('columnheader', { name: /Serial/ })).toHaveAttribute('aria-sort', 'ascending'),
      )

      await user.click(screen.getByRole('button', { name: /Serial/ }))
      expect(router.state.location.search).toBe('?sort=serial&order=desc')

      await user.click(screen.getByRole('button', { name: /Issue date/ }))
      expect(router.state.location.search).toBe('')
    })

    it('restores the previous view with the back button', async () => {
      mockList(() => json(certificatePage(twoRows)))
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates')
      await screen.findByRole('table')

      await user.type(screen.getByRole('searchbox'), 'ana')
      await waitFor(() => expect(router.state.location.search).toBe('?q=ana'))
      await user.click(screen.getByRole('button', { name: /Course/ }))
      expect(router.state.location.search).toBe('?q=ana&sort=course_title')

      await act(() => router.navigate(-1))
      expect(router.state.location.search).toBe('?q=ana')
      await act(() => router.navigate(-1))
      expect(router.state.location.search).toBe('')
      await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
    })

    it('says “no results” for a search with no matches, and clears it', async () => {
      const { requests } = mockList((req) =>
        req.url.searchParams.get('q') ? json(certificatePage([])) : json(certificatePage(twoRows)),
      )
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates?q=zzz&status=valid')

      expect(await screen.findByText('No results for “zzz”')).toBeInTheDocument()
      expect(screen.queryByText('No certificates yet')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Clear search and filters' }))

      expect(router.state.location.search).toBe('')
      expect(await screen.findByRole('table')).toBeInTheDocument()
      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(lastListQuery(requests)).toEqual({ sort: 'issued_at', order: 'desc', page: '1' })
    })

    it('says filters match nothing when there is no search text', async () => {
      mockList(() => json(certificatePage([])))
      renderRoute('/certificates?status=revoked')
      expect(await screen.findByText('No certificates match these filters')).toBeInTheDocument()
    })

    it('still says “no certificates yet” with no search or filter, even when sorted', async () => {
      mockList(() => json(certificatePage([])))
      renderRoute('/certificates?sort=serial')
      expect(await screen.findByText('No certificates yet')).toBeInTheDocument()
    })

    it('keeps search and filters when paging', async () => {
      const { requests } = mockList(() => json(certificatePage(twoRows, { total: 45 })))
      const user = userEvent.setup()
      const { router } = renderRoute('/certificates?q=ana&sort=serial')
      await screen.findByRole('table')
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(router.state.location.search).toBe('?q=ana&sort=serial&page=2')
      await waitFor(() => expect(lastListQuery(requests)).toMatchObject({ q: 'ana', sort: 'serial', page: '2' }))
    })

    it('still works when courses can’t be loaded', async () => {
      mockFetch((req) =>
        req.url.pathname === '/api/courses'
          ? json({ error: 'internal_error', message: 'Boom' }, 500)
          : json(certificatePage(twoRows)),
      )
      renderRoute('/certificates')
      await screen.findByRole('table')
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'All (couldn’t load courses)' })).toBeInTheDocument(),
      )
    })
  })
})
