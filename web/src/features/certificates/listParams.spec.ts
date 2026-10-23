import { describe, expect, it } from 'vitest'
import {
  defaultOrder,
  filterQuery,
  hasFilters,
  nextSort,
  parseListParams,
  toSearchParams,
  type ListParams,
} from './listParams'

const defaults: ListParams = { sort: 'issued_at', order: 'desc', page: 1 }

describe('parseListParams', () => {
  it('uses the defaults for an empty URL', () => {
    expect(parseListParams(new URLSearchParams())).toEqual({
      q: undefined,
      status: undefined,
      courseId: undefined,
      sort: 'issued_at',
      order: 'desc',
      page: 1,
    })
  })

  it('reads every value', () => {
    const params = parseListParams(
      new URLSearchParams('q=Nguyễn&status=valid&courseId=4&sort=serial&order=desc&page=3'),
    )
    expect(params).toEqual({ q: 'Nguyễn', status: 'valid', courseId: 4, sort: 'serial', order: 'desc', page: 3 })
  })

  it('defaults the order per column', () => {
    expect(parseListParams(new URLSearchParams('sort=participant_name')).order).toBe('asc')
  })

  it('ignores invalid values', () => {
    expect(parseListParams(new URLSearchParams('status=x&courseId=-1&sort=x&order=x&page=0'))).toMatchObject(defaults)
  })

  it('trims the search, treats blank as none and caps it at 100 characters', () => {
    expect(parseListParams(new URLSearchParams('q=%20%20')).q).toBeUndefined()
    expect(parseListParams(new URLSearchParams('q=%20ana%20')).q).toBe('ana')
    expect(parseListParams(new URLSearchParams(`q=${'a'.repeat(150)}`)).q).toHaveLength(100)
  })
})

describe('toSearchParams', () => {
  it('leaves defaults out', () => {
    expect(toSearchParams(defaults).toString()).toBe('')
    expect(toSearchParams({ sort: 'serial', order: 'asc', page: 1 }).toString()).toBe('sort=serial')
  })

  it('writes non-default values', () => {
    expect(
      toSearchParams({ q: 'ana', status: 'revoked', courseId: 2, sort: 'serial', order: 'desc', page: 4 }).toString(),
    ).toBe('q=ana&status=revoked&courseId=2&sort=serial&order=desc&page=4')
    expect(toSearchParams({ ...defaults, order: 'asc' }).toString()).toBe('order=asc')
  })

  it('round-trips through parseListParams', () => {
    const params: ListParams = { q: "O'Neil", status: 'valid', courseId: 9, sort: 'course_title', order: 'desc', page: 2 }
    expect(parseListParams(toSearchParams(params))).toEqual(params)
  })
})

describe('sort helpers', () => {
  it('defaultOrder', () => {
    expect(defaultOrder('issued_at')).toBe('desc')
    expect(defaultOrder('serial')).toBe('asc')
  })

  it('nextSort flips the same column and starts a new one at its default', () => {
    expect(nextSort(defaults, 'issued_at')).toEqual({ sort: 'issued_at', order: 'asc' })
    expect(nextSort(defaults, 'serial')).toEqual({ sort: 'serial', order: 'asc' })
    expect(nextSort({ ...defaults, sort: 'serial', order: 'asc' }, 'serial')).toEqual({ sort: 'serial', order: 'desc' })
  })
})

describe('hasFilters and filterQuery', () => {
  it('counts search, status and course, not sort or page', () => {
    expect(hasFilters({ ...defaults, sort: 'serial', page: 3 })).toBe(false)
    expect(hasFilters({ ...defaults, q: 'a' })).toBe(true)
    expect(hasFilters({ ...defaults, status: 'valid' })).toBe(true)
    expect(hasFilters({ ...defaults, courseId: 1 })).toBe(true)
  })

  it('filterQuery drops the page', () => {
    expect(filterQuery({ ...defaults, q: 'a', page: 5 })).toEqual({
      q: 'a',
      status: undefined,
      courseId: undefined,
      sort: 'issued_at',
      order: 'desc',
    })
  })
})
