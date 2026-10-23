import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { certificatePage, certificateSummary } from '../../test/fixtures'
import { json, mockFetch, type MockRequest } from '../../test/fetchMock'
import { renderRoute } from '../../test/render'

const CSV = '﻿learner_name,course_title,serial_number,issue_date,status\r\nAna O\'Neil,First Aid,SYD-2026-000001,2026-01-01,valid\r\n'

function csvResponse(headers: Record<string, string> = {}) {
  return new Response(CSV, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="certificates-SYD-2026-10-23.csv"',
      ...headers,
    },
  })
}

let saved: { name: string; blob: Blob }[]

beforeEach(() => {
  saved = []
  let lastBlob: Blob
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      lastBlob = blob
      return 'blob:x'
    },
    revokeObjectURL: () => {},
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: lastBlob })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Courses and the list answer normally; `onExport` answers the CSV request. */
function fakeApi(onExport: (req: MockRequest) => Response | Promise<Response>) {
  const exports: MockRequest[] = []
  const lists: MockRequest[] = []
  mockFetch((req) => {
    if (req.url.pathname === '/api/courses') return json({ items: [] })
    if (req.url.pathname === '/api/certificates/export.csv') {
      exports.push(req)
      return onExport(req)
    }
    lists.push(req)
    return json(certificatePage([certificateSummary()]))
  })
  return { exports, lists }
}

describe('Export CSV on the list page', () => {
  it('downloads the CSV for the current search, filters and sort, with the server’s file name', async () => {
    const { exports, lists } = fakeApi(() => csvResponse())
    const user = userEvent.setup()
    renderRoute('/certificates?q=ana&status=valid&courseId=3&sort=serial&order=desc&page=2')
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(saved).toHaveLength(1))

    // Same filters as the list on screen, but every row: no page or pageSize
    const listQuery = Object.fromEntries(lists.at(-1)!.url.searchParams)
    const exportQuery = Object.fromEntries(exports[0].url.searchParams)
    expect(exportQuery).toEqual({ q: 'ana', status: 'valid', courseId: '3', sort: 'serial', order: 'desc' })
    const { page: _page, ...listFilters } = listQuery
    expect(exportQuery).toEqual(listFilters)
    expect(exports[0].headers.tenant_id).toBe('SYD')
    expect(exports[0].headers.Accept).toBe('text/csv')

    expect(saved[0].name).toBe('certificates-SYD-2026-10-23.csv')
    await expect(saved[0].blob.text()).resolves.toBe(CSV.replace('﻿', '')) // Blob.text() drops the BOM
    expect(new Uint8Array(await saved[0].blob.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
  })

  it('uses a fallback file name when the server sends none', async () => {
    fakeApi(() => new Response('x', { status: 200 }))
    const user = userEvent.setup()
    renderRoute('/certificates')
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('certificates-SYD.csv')
  })

  it('shows a spinner and blocks a second export while downloading', async () => {
    let release: () => void = () => {}
    const { exports } = fakeApi(() => new Promise((resolve) => (release = () => resolve(csvResponse()))))
    const user = userEvent.setup()
    renderRoute('/certificates')
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    const busy = screen.getByRole('button', { name: 'Exporting…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(exports).toHaveLength(1)

    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled())
    expect(saved).toHaveLength(1)
  })

  it('shows an error and lets you try again', async () => {
    let calls = 0
    fakeApi(() => {
      calls += 1
      return calls === 1
        ? json({ error: 'validation_failed', message: 'Some fields are not valid', fields: { q: 'too long' } }, 400)
        : csvResponse()
    })
    const user = userEvent.setup()
    renderRoute('/certificates')
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t export: Some fields are not valid')
    expect(saved).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
