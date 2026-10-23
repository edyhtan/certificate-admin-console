import { describe, expect, it } from 'vitest'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  it('returns a new client each time with the app defaults', () => {
    const a = createQueryClient()
    const b = createQueryClient()
    expect(a).not.toBe(b)
    expect(a.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    })
  })
})
