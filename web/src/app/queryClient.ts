import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'

/**
 * Retry a failed query once, but never a 4xx: a missing certificate or a bad request won't fix
 * itself. Network errors (status 0) and 5xx are retried.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  })
}
