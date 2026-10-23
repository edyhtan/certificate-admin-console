import { useQuery } from '@tanstack/react-query'
import {
  endpoints,
  issuanceEventSchema,
  issuancePreviewResponseSchema,
  NDJSON_CONTENT_TYPE,
  type IssueCertificatesRequest,
} from '@cert/shared'
import { apiFetch, apiRequest } from '../../api/client'
import { readNdjson } from '../../api/ndjson'
import { currentTenantCode } from '../../api/tenant'

export const issuanceKeys = {
  all: () => ['issuances', currentTenantCode()] as const,
  preview: (courseId: number) => [...issuanceKeys.all(), 'preview', courseId] as const,
}

export function fetchIssuancePreview(courseId: number, signal?: AbortSignal) {
  return apiFetch(endpoints.previewIssuance.path, {
    query: { courseId },
    schema: issuancePreviewResponseSchema,
    signal,
  })
}

/** Counts for "Issue N certificates". `null` course: nothing is fetched. */
export function useIssuancePreview(courseId: number | null) {
  return useQuery({
    queryKey: issuanceKeys.preview(courseId ?? 0),
    queryFn: ({ signal }) => fetchIssuancePreview(courseId!, signal),
    enabled: courseId !== null,
    // Counts change with every run; always ask again
    staleTime: 0,
  })
}

/**
 * Starts a bulk issue run and yields its NDJSON events (`start`, one `result` per learner,
 * `done`) as the server sends them. Errors before the stream starts throw `ApiError`.
 */
export async function* issueCertificates(courseId: number, signal?: AbortSignal) {
  const response = await apiRequest(endpoints.issueCertificates.path, {
    method: 'POST',
    body: { courseId } satisfies IssueCertificatesRequest,
    headers: { Accept: NDJSON_CONTENT_TYPE },
    signal,
  })
  yield* readNdjson(response, issuanceEventSchema)
}
