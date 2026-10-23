import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../app/routes'

/** A query client for tests: no retries, so error states show at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

/** Renders the full app route table at `path`, with a fresh query client. */
export function renderRoute(path: string, queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}

/** Renders one element inside a query client (no router). */
export function renderWithQuery(ui: ReactElement, queryClient = createTestQueryClient()) {
  return { ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>), queryClient }
}
