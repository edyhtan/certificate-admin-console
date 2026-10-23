import { describe, expect, it } from 'vitest'
import type { HealthReport } from '@cert/shared'
import { ApiError } from './errors'
import { downChecks, fetchHealth } from './health'
import { json, mockFetch } from '../test/fetchMock'

const up = { status: 'up', durationMs: 1 } as const
const down = { status: 'down', durationMs: 2000 } as const
const ok: HealthReport = { status: 'ok', checks: { database: up, admin: up } }
const notReady: HealthReport = { status: 'error', checks: { database: up, admin: down } }

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('fetchHealth', () => {
  it('returns the report on 200, asking GET /api/health without a tenant header', async () => {
    const { requests } = mockFetch(() => json(ok))
    await expect(fetchHealth()).resolves.toEqual(ok)
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('GET')
    expect(requests[0].url.pathname).toBe('/api/health')
    expect(requests[0].headers).not.toHaveProperty('tenant_id')
  })

  it('returns the report on 503 instead of throwing, so callers can see what is down', async () => {
    mockFetch(() => json(notReady, 503))
    await expect(fetchHealth()).resolves.toEqual(notReady)
  })

  it('throws network_error when the server cannot be reached', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const error = await caught(fetchHealth())
    expect(error.code).toBe('network_error')
    expect(error.status).toBe(0)
  })

  it('lets an abort through unchanged', async () => {
    mockFetch(() => {
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(fetchHealth()).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('throws for any other status, e.g. a dev proxy 500 when the API is not running', async () => {
    mockFetch(() => new Response('', { status: 500 }))
    const error = await caught(fetchHealth())
    expect(error.status).toBe(500)
    expect(error.code).toBe('internal_error')
  })

  it('throws invalid_response for a body that is not a health report', async () => {
    mockFetch(() => json({ status: 'fine' }))
    expect((await caught(fetchHealth())).code).toBe('invalid_response')
  })

  it('throws invalid_response for a body that is not JSON', async () => {
    mockFetch(() => new Response('<html>', { status: 200 }))
    expect((await caught(fetchHealth())).code).toBe('invalid_response')
  })
})

describe('downChecks', () => {
  it('names the checks that are down', () => {
    expect(downChecks(notReady)).toEqual(['admin'])
    expect(downChecks({ status: 'error', checks: { database: down, admin: down } })).toEqual(['database', 'admin'])
  })

  it('is empty when every check is up', () => {
    expect(downChecks(ok)).toEqual([])
  })
})
