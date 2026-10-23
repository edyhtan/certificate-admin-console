import type { ComponentProps } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { HealthGate } from './HealthGate'

export interface AppProps {
  queryClient: QueryClient
  router: ComponentProps<typeof RouterProvider>['router']
  /** Passed to the health gate; tests pass a short one. */
  healthRetryMs?: number
}

/** The whole app: no route renders, and so no page calls the API, until health is ok (D62). */
export function App({ queryClient, router, healthRetryMs }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <HealthGate retryMs={healthRetryMs}>
        <RouterProvider router={router} />
      </HealthGate>
    </QueryClientProvider>
  )
}
