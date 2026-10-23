import { describe, expect, it } from 'vitest'
import {
  auditDetail,
  auditKeys,
  auditLogLink,
  auditSearchParams,
  fetchAuditEvents,
  parseAuditParams,
} from './api'
import { auditEvent, auditPage } from '../../test/fixtures'
import { json, mockFetch } from '../../test/fetchMock'

describe('parseAuditParams / auditSearchParams', () => {
  it('reads course, action and page; ignores invalid values', () => {
    expect(parseAuditParams(new URLSearchParams('courseId=3&action=certificate.revoked&page=2'))).toEqual({
      courseId: 3,
      action: 'certificate.revoked',
      page: 2,
    })
    expect(parseAuditParams(new URLSearchParams('courseId=x&action=deleted&page=-1'))).toEqual({
      courseId: undefined,
      action: undefined,
      page: 1,
    })
  })

  it('writes only non-default values and round-trips', () => {
    expect(auditSearchParams({ page: 1 }).toString()).toBe('')
    const params = { courseId: 4, action: 'certificate.issued' as const, page: 3 }
    expect(auditSearchParams(params).toString()).toBe('courseId=4&action=certificate.issued&page=3')
    expect(parseAuditParams(auditSearchParams(params))).toEqual(params)
  })

  it('builds the link used after a bulk issue run', () => {
    expect(auditLogLink(7)).toBe('/audit?courseId=7&action=certificate.issued')
    expect(auditLogLink(7, 'certificate.revoked')).toBe('/audit?courseId=7&action=certificate.revoked')
  })
})

describe('auditDetail', () => {
  it.each([
    [null, null],
    [{}, null],
    [{ reason: '  ' }, null],
    [{ reason: 42 }, null],
    [{ reason: 'Name misspelt' }, 'Name misspelt'],
  ])('%j → %j', (details, expected) => {
    expect(auditDetail(details)).toBe(expected)
  })
})

describe('fetchAuditEvents', () => {
  it('calls the audit endpoint with filters and the tenant key', async () => {
    const body = auditPage([auditEvent()])
    const { requests } = mockFetch(() => json(body))
    await expect(fetchAuditEvents({ certificateId: 5, pageSize: 100 })).resolves.toEqual(body)
    expect(requests[0].url.pathname).toBe('/api/audit-events')
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ certificateId: '5', pageSize: '100' })
    expect(auditKeys.list({ page: 2 })).toEqual(['audit', 'SYD', 'list', { page: 2 }])
  })
})
