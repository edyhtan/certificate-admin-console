import { describe, expect, it } from 'vitest'
import { certificateKeys, fetchCertificates, parsePageParam } from './api'
import { certificatePage, certificateSummary } from '../../test/fixtures'
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
