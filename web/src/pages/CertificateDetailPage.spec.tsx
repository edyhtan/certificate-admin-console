import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CertificateDetail } from '@cert/shared'
import { certificateKeys } from '../features/certificates/api'
import { certificateDetail, certificatePage, certificateSummary } from '../test/fixtures'
import { json, mockFetch, never, type MockRequest } from '../test/fetchMock'
import { createTestQueryClient, renderRoute } from '../test/render'

const revoked = (base: CertificateDetail, reason: string | null = 'Issued in error'): CertificateDetail => ({
  ...base,
  status: 'revoked',
  // 5 Apr 2026, 02:30 AEST: the second 02:30 after Sydney daylight saving ends
  revokedAt: '2026-04-04T16:30:00.000Z',
  revokedBy: { id: 1, name: 'admin' },
  revokeReason: reason,
})

function detailValue(term: string): string | null {
  const dt = screen.getByText(term, { selector: 'dt' })
  return dt.nextElementSibling?.textContent ?? null
}

/** A fake API holding one certificate that can be revoked once. */
function fakeApi(initial: CertificateDetail, onRevoke?: (req: MockRequest) => Response | Promise<Response>) {
  let current = initial
  return mockFetch((req) => {
    if (req.url.pathname === `/api/certificates/${initial.id}` && req.method === 'GET') return json(current)
    if (req.url.pathname === `/api/certificates/${initial.id}/revoke` && req.method === 'POST') {
      if (onRevoke) return onRevoke(req)
      if (current.status === 'valid') {
        current = revoked(current, (req.body as { reason?: string }).reason ?? null)
      }
      return json(current)
    }
    if (req.url.pathname === '/api/certificates') return json(certificatePage([certificateSummary()]))
    return json({ error: 'not_found', message: 'Not found' }, 404)
  })
}

describe('CertificateDetailPage', () => {
  it('shows a loading state', async () => {
    mockFetch(() => never())
    renderRoute('/certificates/1')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading certificate…')
  })

  it('shows the certificate with times in the tenant time zone', async () => {
    const { requests } = fakeApi(certificateDetail())
    renderRoute('/certificates/1')

    expect(await screen.findByRole('heading', { level: 1, name: 'SYD-2026-000001' })).toBeInTheDocument()
    expect(detailValue('Serial')).toBe('SYD-2026-000001')
    expect(detailValue('Participant')).toBe("Ana O'Neil")
    expect(detailValue('Course')).toBe('Workplace Safety')
    // 13:30 UTC on 31 Dec 2025 is 00:30 on New Year's Day in Sydney
    expect(detailValue('Issued')).toBe('1 Jan 2026, 00:30 AEDT')
    expect(detailValue('Issued by')).toBe('admin')
    expect(detailValue('Status')).toBe('Valid')
    expect(screen.getByText('Times are in Australia/Sydney.')).toBeInTheDocument()
    expect(screen.queryByText('Reason', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument()

    expect(requests[0].url.pathname).toBe('/api/certificates/1')
    expect(requests[0].headers.tenant_id).toBe('SYD')
  })

  it('shows revoke details and no Revoke button for a revoked certificate', async () => {
    fakeApi(revoked(certificateDetail()))
    renderRoute('/certificates/1')
    await screen.findByRole('heading', { level: 1, name: 'SYD-2026-000001' })
    expect(detailValue('Status')).toBe('Revoked')
    expect(detailValue('Revoked')).toBe('5 Apr 2026, 02:30 AEST')
    expect(detailValue('Revoked by')).toBe('admin')
    expect(detailValue('Reason')).toBe('Issued in error')
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })

  it('says when a revoked certificate has no reason', async () => {
    fakeApi(revoked(certificateDetail(), null))
    renderRoute('/certificates/1')
    await screen.findByRole('heading', { level: 1, name: 'SYD-2026-000001' })
    expect(detailValue('Reason')).toBe('No reason given')
  })

  it('shows "certificate not found" for a 404, without retrying', async () => {
    const { requests } = mockFetch(() => json({ error: 'not_found', message: 'Certificate not found' }, 404))
    renderRoute('/certificates/999')
    expect(await screen.findByText('Certificate not found')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to certificates' })[0]).toHaveAttribute('href', '/certificates')
    expect(requests).toHaveLength(1)
  })

  it.each(['abc', '0', '-4', '1.5'])('shows "not found" for id %s without calling the API', async (id) => {
    const { requests } = mockFetch(() => never())
    renderRoute(`/certificates/${id}`)
    expect(await screen.findByText('Certificate not found')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('shows other errors with a retry', async () => {
    let calls = 0
    mockFetch(() => {
      calls += 1
      return calls === 1
        ? json({ error: 'internal_error', message: 'Something went wrong on the server' }, 500)
        : json(certificateDetail())
    })
    const user = userEvent.setup()
    renderRoute('/certificates/1')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load this certificate')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'SYD-2026-000001' })).toBeInTheDocument()
  })

  it('revokes with a reason, then shows the revoked state and refreshes the list', async () => {
    let releaseRevoke: () => void = () => {}
    let current = certificateDetail()
    const { requests } = mockFetch((req) => {
      if (req.method === 'POST') {
        return new Promise((resolve) => {
          releaseRevoke = () => {
            current = revoked(current, 'Wrong course')
            resolve(json(current))
          }
        })
      }
      if (req.url.pathname === '/api/certificates') return json(certificatePage([certificateSummary()]))
      return json(current)
    })
    const queryClient = createTestQueryClient()
    // A cached list page, as if the admin came from the list
    queryClient.setQueryData(certificateKeys.list({ page: 1 }), certificatePage([certificateSummary()]))
    const user = userEvent.setup()
    renderRoute('/certificates/1', queryClient)

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('dialog', { name: 'Revoke SYD-2026-000001?' })
    await user.type(within(dialog).getByLabelText('Reason (optional)'), 'Wrong course')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke certificate' }))

    // Sending: the button can't be pressed again
    const sending = within(dialog).getByRole('button', { name: 'Revoking…' })
    expect(sending).toBeDisabled()
    await user.click(sending)

    releaseRevoke()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Certificate revoked.')
    expect(detailValue('Status')).toBe('Revoked')
    expect(detailValue('Reason')).toBe('Wrong course')
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()

    const posts = requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url.pathname).toBe('/api/certificates/1/revoke')
    expect(posts[0].body).toEqual({ reason: 'Wrong course' })
    expect(posts[0].headers.tenant_id).toBe('SYD')
    expect(queryClient.getQueryState(certificateKeys.list({ page: 1 }))?.isInvalidated).toBe(true)
  })

  it('sends an empty body when no reason is given', async () => {
    const { requests } = fakeApi(certificateDetail())
    const user = userEvent.setup()
    renderRoute('/certificates/1')
    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke certificate' }))
    await screen.findByText('Certificate revoked.')
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({})
    expect(detailValue('Reason')).toBe('No reason given')
  })

  it('shows no error when the certificate was already revoked elsewhere', async () => {
    // Another tab revoked it first: the API answers 200 with the current, revoked state
    fakeApi(certificateDetail(), () => json(revoked(certificateDetail(), 'Revoked in another tab')))
    const user = userEvent.setup()
    renderRoute('/certificates/1')
    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke certificate' }))

    await screen.findByText('Certificate revoked.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(detailValue('Reason')).toBe('Revoked in another tab')
  })

  it('keeps the dialog open with the error when revoking fails, and can try again', async () => {
    let attempts = 0
    fakeApi(certificateDetail(), () => {
      attempts += 1
      return attempts === 1
        ? json({ error: 'internal_error', message: 'Something went wrong on the server' }, 500)
        : json(revoked(certificateDetail(), null))
    })
    const user = userEvent.setup()
    renderRoute('/certificates/1')
    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke certificate' }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t revoke: Something went wrong on the server',
    )
    expect(detailValue('Status')).toBe('Valid')

    await user.click(within(dialog).getByRole('button', { name: 'Revoke certificate' }))
    await screen.findByText('Certificate revoked.')
    expect(attempts).toBe(2)
  })

  it('cancels without sending anything, and a reopened dialog has no old error', async () => {
    let attempts = 0
    const { requests } = fakeApi(certificateDetail(), () => {
      attempts += 1
      return json({ error: 'internal_error', message: 'Boom' }, 500)
    })
    const user = userEvent.setup()
    renderRoute('/certificates/1')

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke certificate' }))
    await screen.findByText(/Couldn’t revoke/)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument()
    expect(attempts).toBe(1)
  })
})
