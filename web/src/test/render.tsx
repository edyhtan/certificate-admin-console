import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Tenant } from '@cert/shared'
import { routes } from '../app/routes'
import { tenantKeys } from '../features/tenants/api'

/** The tenants of the M3 registry (spec §3.1). */
export const TENANTS: Tenant[] = [
  { code: 'SYD', name: 'Sydney', timezone: 'Australia/Sydney' },
  { code: 'PER', name: 'Perth', timezone: 'Australia/Perth' },
  { code: 'ADL', name: 'Adelaide', timezone: 'Australia/Adelaide' },
]

/** A query client for tests: no retries, so error states show at once. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

/**
 * Renders the full app route table at `path`, with a fresh query client. The tenant list is
 * put in the cache, so pages don't fetch it; pass `tenants: null` to let it be fetched.
 */
export function renderRoute(
  path: string,
  queryClient = createTestQueryClient(),
  { tenants = TENANTS }: { tenants?: Tenant[] | null } = {},
) {
  if (tenants) queryClient.setQueryData(tenantKeys.all, { items: tenants })
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
