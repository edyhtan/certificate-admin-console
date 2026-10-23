import { describe, expect, it } from 'vitest'
import { certificateKeys, fetchCertificate, fetchCertificates, parsePageParam, revokeCertificate } from './api'
import { certificateDetail, certificatePage, certificateSummary } from '../../test/fixtures'
import { json, mockFetch } from '../../test/fetchMock'

describe('parsePageParam', () => {
  it.each([
    [null, 1],
    ['', 1],
    ['1', 1],
    ['7', 7],
    ['0', 1],
    ['-3', 1],
    ['2.5', 1],
    ['abc', 1],
  ])('%j → %i', (value, page) => {
    expect(parsePageParam(value)).toBe(page)
  })
})

describe('certificateKeys', () => {
  it('puts the tenant code in every key', () => {
    expect(certificateKeys.all()).toEqual(['certificates', 'SYD'])
    expect(certificateKeys.list({ page: 2 })).toEqual(['certificates', 'SYD', 'list', { page: 2 }])
  })
})

describe('fetchCertificates', () => {
  it('calls the list endpoint and parses the page', async () => {
    const page = certificatePage([certificateSummary()])
    const { requests } = mockFetch(() => json(page))
    await expect(fetchCertificates({ page: 3, pageSize: 50 })).resolves.toEqual(page)
    expect(requests[0].url.pathname).toBe('/api/certificates')
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ page: '3', pageSize: '50' })
  })
})

describe('fetchCertificate', () => {
  it('calls the detail endpoint and parses the certificate', async () => {
    const detail = certificateDetail({ id: 7 })
    const { requests } = mockFetch(() => json(detail))
    await expect(fetchCertificate(7)).resolves.toEqual(detail)
    expect(requests[0].url.pathname).toBe('/api/certificates/7')
    expect(certificateKeys.detail(7)).toEqual(['certificates', 'SYD', 'detail', 7])
  })
})

describe('revokeCertificate', () => {
  it('posts the reason and parses the result', async () => {
    const detail = certificateDetail({ id: 7, status: 'revoked', revokedAt: '2026-05-01T00:00:00.000Z' })
    const { requests } = mockFetch(() => json(detail))
    await expect(revokeCertificate(7, 'Typo')).resolves.toEqual(detail)
    expect(requests[0]).toMatchObject({ method: 'POST', body: { reason: 'Typo' } })
    expect(requests[0].url.pathname).toBe('/api/certificates/7/revoke')
  })

  it('posts an empty body without a reason', async () => {
    const { requests } = mockFetch(() => json(certificateDetail()))
    await revokeCertificate(1)
    expect(requests[0].body).toEqual({})
  })
})
