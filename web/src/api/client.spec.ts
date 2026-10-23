import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { apiFetch, apiRequest, buildQueryString } from './client'
import { ApiError } from './errors'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: MockInstance<typeof fetch>

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: String(url), init: init!, headers: init!.headers as Record<string, string> }
}

describe('buildQueryString', () => {
  it('skips undefined, null and empty values', () => {
    expect(buildQueryString({ page: 2, q: '', status: undefined, courseId: null, x: false })).toBe(
      '?page=2&x=false',
    )
  })

  it('encodes values', () => {
    expect(buildQueryString({ q: "O'Neil & Nguyễn" })).toBe('?q=O%27Neil+%26+Nguy%E1%BB%85n')
  })

  it('returns an empty string when nothing is left', () => {
    expect(buildQueryString({ q: '' })).toBe('')
    expect(buildQueryString()).toBe('')
  })
})

describe('apiFetch', () => {
  it('calls /api with the tenant header and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 7, serial: 'SYD-2026-000007' }))
    const schema = z.object({ id: z.number(), serial: z.string() })

    const result = await apiFetch('/api/certificates/7', { schema })

    expect(result).toEqual({ id: 7, serial: 'SYD-2026-000007' })
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/certificates/7')
    expect(init.method).toBe('GET')
    expect(headers.tenant_id).toBe('SYD')
    expect(headers.Accept).toBe('application/json')
    expect(init.body).toBeUndefined()
  })

  it('adds the query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }))
    await apiFetch('/api/certificates', { query: { page: 3, pageSize: 20, q: '' } })
    expect(lastCall().url).toBe('/api/certificates?page=3&pageSize=20')
  })

  it('sends a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await apiFetch('/api/certificates/7/revoke', { method: 'POST', body: { reason: 'Typo' } })
    const { init, headers } = lastCall()
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"reason":"Typo"}')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('never lets a caller override the tenant header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    await apiFetch('/api/courses', { headers: { tenant_id: 'PER' } })
    expect(lastCall().headers.tenant_id).toBe('SYD')
  })

  it('returns the body unparsed without a schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse([1, 2]))
    await expect(apiFetch('/api/x')).resolves.toEqual([1, 2])
  })

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiFetch('/api/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('throws ApiError with the server error shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'validation_failed', message: 'Some fields are not valid', fields: { page: 'Too small' } },
        400,
      ),
    )
    const error = await apiFetch('/api/certificates').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_failed',
      message: 'Some fields are not valid',
      fields: { page: 'Too small' },
    })
  })

  it('throws a not_found ApiError for 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not_found', message: 'Certificate not found' }, 404))
    const error = (await apiFetch('/api/certificates/999').catch((e: unknown) => e)) as ApiError
    expect(error.isNotFound).toBe(true)
    expect(error.message).toBe('Certificate not found')
  })

  it('keeps the status when the error body is not the API shape', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(apiFetch('/api/x')).rejects.toMatchObject({
      status: 502,
      code: 'internal_error',
      message: 'Request failed (502)',
    })
  })

  it('throws network_error with status 0 when fetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('rethrows aborts unchanged', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)
    await expect(apiFetch('/api/x')).rejects.toBe(abort)
  })

  it('passes the abort signal to fetch', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const controller = new AbortController()
    await apiFetch('/api/x', { signal: controller.signal })
    expect(lastCall().init.signal).toBe(controller.signal)
  })

  it('throws invalid_response when the body does not match the schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'seven' }))
    await expect(apiFetch('/api/x', { schema: z.object({ id: z.number() }) })).rejects.toMatchObject({
      status: 200,
      code: 'invalid_response',
    })
  })

  it('throws invalid_response when a 2xx body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('apiRequest', () => {
  it('returns the raw response for non-JSON endpoints', async () => {
    fetchMock.mockResolvedValue(new Response('a,b\n1,2\n', { status: 200 }))
    const response = await apiRequest('/api/certificates/export.csv', { headers: { Accept: 'text/csv' } })
    await expect(response.text()).resolves.toBe('a,b\n1,2\n')
    expect(lastCall().headers.Accept).toBe('text/csv')
  })
})
