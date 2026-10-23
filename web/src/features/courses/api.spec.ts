import { describe, expect, it } from 'vitest'
import { courseKeys, fetchCourses } from './api'
import { json, mockFetch } from '../../test/fetchMock'

describe('courses api', () => {
  it('fetches the course list with the tenant header', async () => {
    const body = { items: [{ id: 1, code: 'FA', title: 'First Aid' }] }
    const { requests } = mockFetch(() => json(body))
    await expect(fetchCourses()).resolves.toEqual(body)
    expect(requests[0].url.pathname).toBe('/api/courses')
    expect(requests[0].headers.tenant_id).toBe('SYD')
  })

  it('keys courses by tenant', () => {
    expect(courseKeys.all()).toEqual(['courses', 'SYD'])
  })
})
