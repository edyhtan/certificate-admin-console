import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IssuancePreviewResponse } from '@cert/shared'
import { json, mockFetch, ndjsonStream, never, type MockRequest } from '../test/fetchMock'
import { renderRoute } from '../test/render'

const courses = {
  items: [
    { id: 1, code: 'FA', title: 'First Aid Essentials' },
    { id: 2, code: 'LT', title: 'Leading Teams' },
  ],
}

type Stream = ReturnType<typeof ndjsonStream>

/**
 * A fake API: courses, a preview the test can change, and one controllable NDJSON stream per
 * POST (or a canned response from `onIssue`).
 */
function fakeApi(options: { preview?: Partial<IssuancePreviewResponse>; onIssue?: (req: MockRequest) => Response } = {}) {
  const state = {
    preview: { courseId: 1, completed: 5, alreadyIssued: 2, eligible: 3, ...options.preview },
    streams: [] as Stream[],
  }
  const { requests } = mockFetch((req) => {
    if (req.url.pathname === '/api/courses') return json(courses)
    if (req.url.pathname === '/api/issuances/preview') {
      return json({ ...state.preview, courseId: Number(req.url.searchParams.get('courseId')) })
    }
    if (req.url.pathname === '/api/issuances' && req.method === 'POST') {
      if (options.onIssue) return options.onIssue(req)
      const stream = ndjsonStream()
      state.streams.push(stream)
      return stream.response
    }
    return never()
  })
  const posts = () => requests.filter((r) => r.method === 'POST')
  const previews = () => requests.filter((r) => r.url.pathname === '/api/issuances/preview')
  return { state, requests, posts, previews }
}

const results = [
  { type: 'result', enrollmentId: 7, participantName: "Ana O'Neil", outcome: 'issued', serial: 'SYD-2026-000018' },
  { type: 'result', enrollmentId: 8, participantName: 'Bảo Nguyễn', outcome: 'skipped', reason: 'revoked' },
  { type: 'result', enrollmentId: 9, participantName: 'Cy Lee', outcome: 'failed', message: 'Lock wait timeout' },
] as const

function resultRows() {
  const table = screen.getByRole('table', { name: 'Results per learner' })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))
}

async function chooseCourse(user: ReturnType<typeof userEvent.setup>, title = 'First Aid Essentials') {
  await waitFor(() => expect(screen.getByRole('option', { name: title })).toBeInTheDocument())
  await user.selectOptions(screen.getByRole('combobox', { name: 'Course' }), title)
}

describe('BulkIssuePage', () => {
  it('shows the eligible count for the chosen course', async () => {
    const { previews } = fakeApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/bulk-issue')

    expect(screen.queryByRole('button', { name: /Issue/ })).not.toBeInTheDocument()
    await chooseCourse(user)
    expect(router.state.location.search).toBe('?courseId=1')
    expect(await screen.findByText(/5 learners have completed First Aid Essentials; 2 already have a certificate/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue 3 certificates' })).toBeEnabled()
    expect(previews()[0].url.searchParams.get('courseId')).toBe('1')
    expect(previews()[0].headers.tenant_id).toBe('SYD')
  })

  it('takes the course from the URL', async () => {
    fakeApi({ preview: { completed: 1, alreadyIssued: 0, eligible: 1 } })
    renderRoute('/bulk-issue?courseId=2')
    expect(await screen.findByRole('button', { name: 'Issue 1 certificate' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('2')
  })

  it('disables the button when nothing is eligible', async () => {
    fakeApi({ preview: { completed: 4, alreadyIssued: 4, eligible: 0 } })
    renderRoute('/bulk-issue?courseId=1')
    expect(await screen.findByRole('button', { name: 'Nothing to issue' })).toBeDisabled()
  })

  it('streams progress and per-learner results, sending one request even on a double click', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')

    const button = await screen.findByRole('button', { name: 'Issue 3 certificates' })
    await user.dblClick(button)
    expect(screen.getByRole('button', { name: 'Issuing…' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Course' })).toBeDisabled()
    await waitFor(() => expect(api.posts()).toHaveLength(1))
    expect(api.posts()[0].body).toEqual({ courseId: 1 })
    expect(api.posts()[0].headers.Accept).toBe('application/x-ndjson')

    const stream = api.state.streams[0]
    stream.send({ type: 'start', total: 3 })
    const progress = await screen.findByRole('progressbar', { name: 'Bulk issue progress' })
    expect(progress).toHaveAttribute('max', '3')
    expect(screen.getByText('0 / 3 processed')).toBeInTheDocument()

    stream.send(results[0])
    expect(await screen.findByText('1 / 3 processed')).toBeInTheDocument()
    expect(resultRows()).toEqual([["Ana O'Neil", 'Issued', 'SYD-2026-000018']])

    // Clicking while it runs still sends nothing
    await user.click(screen.getByRole('button', { name: 'Issuing…' }))

    stream.send(results[1], results[2])
    expect(await screen.findByText('3 / 3 processed')).toBeInTheDocument()
    expect(resultRows()).toEqual([
      ["Ana O'Neil", 'Issued', 'SYD-2026-000018'],
      ['Bảo Nguyễn', 'Skipped', 'Certificate was revoked'],
      ['Cy Lee', 'Failed', 'Lock wait timeout'],
    ])
    expect(screen.getByText('1 issued · 1 skipped · 1 failed')).toBeInTheDocument()
    expect(screen.queryByText(/^Done:/)).not.toBeInTheDocument()

    api.state.preview = { courseId: 1, completed: 5, alreadyIssued: 4, eligible: 1 }
    stream.send({ type: 'done', issued: 1, skipped: 1, failed: 1 })
    stream.close()

    expect(await screen.findByText('Done: 1 issued, 1 skipped, 1 failed.')).toBeInTheDocument()
    expect(screen.getByText('Failed learners are tried again on the next run.')).toBeInTheDocument()
    // The counts are fetched again after the run
    expect(await screen.findByRole('button', { name: 'Issue 1 certificate' })).toBeEnabled()
    expect(api.posts()).toHaveLength(1)
  })

  it('runs again safely: a second run reports everyone as skipped', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')

    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send({ type: 'start', total: 1 }, results[0], { type: 'done', issued: 1, skipped: 0, failed: 0 })
    api.state.streams[0].close()
    await screen.findByText('Done: 1 issued, 0 skipped, 0 failed.')

    await user.click(screen.getByRole('button', { name: 'Run again' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(2))
    // The new run starts with an empty result table
    expect(screen.queryByRole('table', { name: 'Results per learner' })).not.toBeInTheDocument()
    api.state.streams[1].send(
      { type: 'start', total: 1 },
      { type: 'result', enrollmentId: 7, participantName: "Ana O'Neil", outcome: 'skipped', reason: 'already_issued' },
      { type: 'done', issued: 0, skipped: 1, failed: 0 },
    )
    api.state.streams[1].close()

    expect(await screen.findByText('Done: 0 issued, 1 skipped, 0 failed.')).toBeInTheDocument()
    expect(resultRows()).toEqual([["Ana O'Neil", 'Skipped', 'Already has a certificate']])
  })

  it('keeps what was done when the connection drops, and offers to run again', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')

    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send({ type: 'start', total: 3 }, results[0])
    await screen.findByText('1 / 3 processed')
    api.state.streams[0].fail()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The run stopped after 1 of 3 learners')
    expect(alert).toHaveTextContent('Can’t reach the server')
    expect(alert).toHaveTextContent('Everything processed so far is saved')
    expect(resultRows()).toEqual([["Ana O'Neil", 'Issued', 'SYD-2026-000018']])

    await user.click(screen.getByRole('button', { name: 'Run again' }))
    await waitFor(() => expect(api.posts()).toHaveLength(2))
  })

  it('treats a stream that ends without “done” as interrupted', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send({ type: 'start', total: 3 }, results[0])
    api.state.streams[0].close()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server stopped sending updates before the run finished.',
    )
  })

  it('shows an error that stops the run before it starts', async () => {
    fakeApi({ onIssue: () => json({ error: 'not_found', message: 'Course not found' }, 404) })
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The run didn’t start')
    expect(alert).toHaveTextContent('Course not found')
    expect(alert).not.toHaveTextContent('Everything processed so far')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows a preview error, and “course not found” for a 404', async () => {
    mockFetch((req) =>
      req.url.pathname === '/api/courses' ? json(courses) : json({ error: 'not_found', message: 'Course not found' }, 404),
    )
    renderRoute('/bulk-issue?courseId=99')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Course not found')
    expect(screen.queryByRole('button', { name: /Issue/ })).not.toBeInTheDocument()
  })

  it('shows an error when courses can’t be loaded', async () => {
    mockFetch(() => json({ error: 'internal_error', message: 'Boom' }, 500))
    renderRoute('/bulk-issue')
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load courses')
  })

  it('clears the last run when another course is chosen', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send({ type: 'start', total: 1 }, results[0], { type: 'done', issued: 1, skipped: 0, failed: 0 })
    api.state.streams[0].close()
    await screen.findByText(/^Done:/)

    await chooseCourse(user, 'Leading Teams')
    await waitFor(() => expect(screen.queryByText(/^Done:/)).not.toBeInTheDocument())
    expect(screen.queryByRole('table', { name: 'Results per learner' })).not.toBeInTheDocument()
  })

  it('warns before leaving the page while a run is going', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))

    await user.click(screen.getByRole('link', { name: 'Certificates' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave while issuing?' })
    expect(router.state.location.pathname).toBe('/bulk-issue')

    await user.click(within(dialog).getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/bulk-issue')

    await user.click(screen.getByRole('link', { name: 'Certificates' }))
    await user.click(await screen.findByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/certificates'))
  })

  it('lets you leave freely when no run is going', async () => {
    fakeApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/bulk-issue?courseId=1')
    await screen.findByRole('button', { name: 'Issue 3 certificates' })
    await user.click(screen.getByRole('link', { name: 'Audit log' }))
    expect(router.state.location.pathname).toBe('/audit')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('links to the audit log filtered to the course after issuing (M2.T9)', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    const { router } = renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send({ type: 'start', total: 1 }, results[0], { type: 'done', issued: 1, skipped: 0, failed: 0 })
    api.state.streams[0].close()

    await user.click(await screen.findByRole('link', { name: 'View audit log' }))
    expect(router.state.location.pathname).toBe('/audit')
    expect(router.state.location.search).toBe('?courseId=1&action=certificate.issued')
  })

  it('has no audit log link when nothing was issued', async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderRoute('/bulk-issue?courseId=1')
    await user.click(await screen.findByRole('button', { name: 'Issue 3 certificates' }))
    await waitFor(() => expect(api.state.streams).toHaveLength(1))
    api.state.streams[0].send(
      { type: 'start', total: 1 },
      { type: 'result', enrollmentId: 7, participantName: 'A', outcome: 'skipped', reason: 'already_issued' },
      { type: 'done', issued: 0, skipped: 1, failed: 0 },
    )
    api.state.streams[0].close()
    await screen.findByText(/^Done:/)
    expect(screen.queryByRole('link', { name: 'View audit log' })).not.toBeInTheDocument()
  })
})
