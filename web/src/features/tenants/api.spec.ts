import { describe, expect, it } from 'vitest'
import { fetchTenants, pickTenant } from './api'
import { json, mockFetch } from '../../test/fetchMock'
import { TENANTS } from '../../test/render'

describe('pickTenant', () => {
  it('picks the remembered tenant, else the first', () => {
    expect(pickTenant(TENANTS, 'PER')?.code).toBe('PER')
    expect(pickTenant(TENANTS, 'XYZ')?.code).toBe('SYD')
    expect(pickTenant(TENANTS, null)?.code).toBe('SYD')
    expect(pickTenant([], 'SYD')).toBeUndefined()
  })
})

describe('fetchTenants', () => {
  it('calls GET /api/tenants without a tenant header', async () => {
    const { requests } = mockFetch(() => json({ items: TENANTS }))
    await expect(fetchTenants()).resolves.toEqual({ items: TENANTS })
    expect(requests[0].url.pathname).toBe('/api/tenants')
    expect(requests[0].headers).not.toHaveProperty('tenant_id')
  })

  it('rejects a tenant list that leaks anything unexpected in the wrong shape', async () => {
    mockFetch(() => json({ items: [{ code: 'syd', name: 'Sydney', timezone: 'Australia/Sydney' }] }))
    await expect(fetchTenants()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
