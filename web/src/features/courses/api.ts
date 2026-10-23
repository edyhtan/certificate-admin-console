import { useQuery } from '@tanstack/react-query'
import { courseListResponseSchema, endpoints } from '@cert/shared'
import { apiFetch } from '../../api/client'
import { currentTenantCode } from '../../api/tenant'

export const courseKeys = {
  all: () => ['courses', currentTenantCode()] as const,
}

export function fetchCourses(signal?: AbortSignal) {
  return apiFetch(endpoints.listCourses.path, { schema: courseListResponseSchema, signal })
}

/** All courses of the tenant, by title. Feeds the course filter and the bulk issue picker. */
export function useCourses() {
  return useQuery({
    queryKey: courseKeys.all(),
    queryFn: ({ signal }) => fetchCourses(signal),
    select: (data) => data.items,
  })
}
