import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { auditEvent, auditPage } from '../test/fixtures'
import { json, mockFetch, never, type MockHandler, type MockRequest } from '../test/fetchMock'
import { renderRoute } from '../test/render'

const courses = { items: [{ id: 21, code: 'WS', title: 'Workplace Safety' }, { id: 22, code: 'FA', title: 'First Aid' }] }

const events = [
  auditEvent({
    id: 2,
    action: 'certificate.revoked',
    occurredAt: '2026-04-04T16:30:00.000Z',
    details: { reason: 'Name misspelt' },
  }),
  auditEvent({ id: 1, certificateId: 1 }),
]

function mockAudit(handler: MockHandler) {
  const requests: MockRequest[] = []
  mockFetch((req) => {
    if (req.url.pathname === '/api/courses') return json(courses)
    if (req.url.pathname === '/api/audit-events') {
      requests.push(req)
      return handler(req)
    }
    return never()
  })
  return { requests, last: () => Object.fromEntries(requests.at(-1)!.url.searchParams) }
}

function rows() {
  return within(screen.getByRole('table', { name: 'Audit events' }))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))
}

describe('AuditLogPage', () => {
  it('lists events with actor, tenant-time, course, participant and a link to the certificate', async () => {
    const { last } = mockAudit(() => json(auditPage(events)))
    const user = userEvent.setup()
    const { router } = renderRoute('/audit')

    await screen.findByRole('table', { name: 'Audit events' })
    expect(rows()).toEqual([
      ['5 Apr 2026, 02:30 AEST', 'Revoked — “Name misspelt”', 'admin', 'Workplace Safety', "Ana O'Neil", 'SYD-2026-000001'],
      ['1 Jan 2026, 00:30 AEDT', 'Issued', 'admin', 'Workplace Safety', "Ana O'Neil", 'SYD-2026-000001'],
    ])
    expect(last()).toEqual({ page: '1' })

    await user.click(screen.getAllByRole('link', { name: 'SYD-2026-000001' })[1])
    expect(router.state.location.pathname).toBe('/certificates/1')
  })

  it('shows a loading state', async () => {
    mockAudit(() => never())
    renderRoute('/audit')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading audit log…')
  })

  it('filters by course and action in the URL, resetting the page', async () => {
    const { last } = mockAudit(() => json(auditPage(events, { total: 45 })))
    const user = userEvent.setup()
    const { router } = renderRoute('/audit?page=2')
    await screen.findByRole('table')

    await waitFor(() => expect(screen.getByRole('option', { name: 'First Aid' })).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'First Aid')
    expect(router.state.location.search).toBe('?courseId=22')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'Revoked')
    expect(router.state.location.search).toBe('?courseId=22&action=certificate.revoked')
    await waitFor(() => expect(last()).toEqual({ courseId: '22', action: 'certificate.revoked', page: '1' }))

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(router.state.location.search).toBe('?courseId=22&action=certificate.revoked&page=2')
  })

  it('restores filters from the URL and ignores invalid ones', async () => {
    const { last } = mockAudit(() => json(auditPage(events)))
    renderRoute('/audit?courseId=21&action=certificate.issued&page=3')
    await screen.findByRole('table')
    expect(last()).toEqual({ courseId: '21', action: 'certificate.issued', page: '3' })
    expect(screen.getByRole('combobox', { name: 'Action' })).toHaveValue('certificate.issued')
  })

  it('says when there are no events at all', async () => {
    mockAudit(() => json(auditPage([])))
    renderRoute('/audit')
    expect(await screen.findByText('No audit events yet')).toBeInTheDocument()
  })

  it('says when filters match nothing, and clears them', async () => {
    const { last } = mockAudit((req) => json(auditPage(req.url.searchParams.get('action') ? [] : events)))
    const user = userEvent.setup()
    const { router } = renderRoute('/audit?action=certificate.revoked')
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(router.state.location.search).toBe('')
    await screen.findByRole('table')
    expect(last()).toEqual({ page: '1' })
  })

  it('shows an error with retry', async () => {
    let calls = 0
    mockAudit(() => {
      calls += 1
      return calls === 1 ? json({ error: 'internal_error', message: 'Boom' }, 500) : json(auditPage(events))
    })
    const user = userEvent.setup()
    renderRoute('/audit')
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the audit log')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
