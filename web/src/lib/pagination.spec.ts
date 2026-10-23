import { describe, expect, it } from 'vitest'
import { pageCount } from './pagination'

describe('pageCount', () => {
  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [45, 20, 3],
    [5, 0, 0],
  ])('total %i, page size %i → %i pages', (total, pageSize, pages) => {
    expect(pageCount(total, pageSize)).toBe(pages)
  })
})
