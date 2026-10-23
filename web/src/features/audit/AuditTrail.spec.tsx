import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditTrail } from './AuditTrail'
import { auditEvent, auditPage } from '../../test/fixtures'
import { json, mockFetch, never } from '../../test/fetchMock'
import { renderWithQuery } from '../../test/render'

describe('AuditTrail', () => {
  it('lists the certificate’s events with times in the tenant time zone', async () => {
    const { requests } = mockFetch(() =>
      json(
        auditPage([
          auditEvent({
            id: 2,
            action: 'certificate.revoked',
            occurredAt: '2026-04-04T16:30:00.000Z',
            details: { reason: 'Name misspelt' },
          }),
          auditEvent({ id: 1 }),
        ]),
      ),
    )
    renderWithQuery(<AuditTrail certificateId={1} />)

    const section = screen.getByRole('region', { name: 'Audit trail' })
    const items = await within(section).findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Revoked 5 Apr 2026, 02:30 AEST by admin — “Name misspelt”',
      'Issued 1 Jan 2026, 00:30 AEDT by admin',
    ])
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ certificateId: '1', pageSize: '100' })
  })

  it('shows a loading state', () => {
    mockFetch(() => never())
    renderWithQuery(<AuditTrail certificateId={1} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading audit trail…')
  })

  it('shows an empty state', async () => {
    mockFetch(() => json(auditPage([])))
    renderWithQuery(<AuditTrail certificateId={1} />)
    expect(await screen.findByText('No audit events yet')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return calls === 1 ? json({ error: 'internal_error', message: 'Boom' }, 500) : json(auditPage([auditEvent()]))
    })
    renderWithQuery(<AuditTrail certificateId={1} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the audit trail')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('listitem')).toHaveTextContent('Issued 1 Jan 2026, 00:30 AEDT by admin')
  })
})
