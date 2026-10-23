import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import { createQueryClient, shouldRetry } from './queryClient'

describe('createQueryClient', () => {
  it('returns a new client each time with the app defaults', () => {
    const a = createQueryClient()
    const b = createQueryClient()
    expect(a).not.toBe(b)
    expect(a.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    })
  })
})

describe('shouldRetry', () => {
  it.each([
    [new ApiError(404, 'not_found', 'Not found'), false],
    [new ApiError(400, 'validation_failed', 'Bad'), false],
    [new ApiError(500, 'internal_error', 'Boom'), true],
    [new ApiError(0, 'network_error', 'Offline'), true],
    [new Error('other'), true],
  ])('first failure %o → retry %s', (error, expected) => {
    expect(shouldRetry(0, error)).toBe(expected)
  })

  it('retries at most once', () => {
    expect(shouldRetry(1, new ApiError(500, 'internal_error', 'Boom'))).toBe(false)
  })
})
