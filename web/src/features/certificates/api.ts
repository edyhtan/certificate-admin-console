import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  certificateListResponseSchema,
  endpoints,
  paginationQuerySchema,
  type CertificateListQuery,
} from '@cert/shared'
import { apiFetch } from '../../api/client'
import { currentTenantCode } from '../../api/tenant'

/** List query parameters as the client sends them; the API fills in the defaults. */
export type CertificateListFilters = Partial<CertificateListQuery>

/**
 * Query keys. The tenant code is in every key, so one tenant's data can never be served for
 * another (spec §6).
 */
export const certificateKeys = {
  all: () => ['certificates', currentTenantCode()] as const,
  lists: () => [...certificateKeys.all(), 'list'] as const,
  list: (params: CertificateListFilters) => [...certificateKeys.lists(), params] as const,
}

export function fetchCertificates(params: CertificateListFilters, signal?: AbortSignal) {
  return apiFetch(endpoints.listCertificates.path, {
    query: params,
    schema: certificateListResponseSchema,
    signal,
  })
}

/** The certificate list. Keeps the previous page on screen while the next one loads. */
export function useCertificateList(params: CertificateListFilters) {
  return useQuery({
    queryKey: certificateKeys.list(params),
    queryFn: ({ signal }) => fetchCertificates(params, signal),
    placeholderData: keepPreviousData,
  })
}

/** `?page=` from the URL: a whole number from 1, anything else (missing, `0`, `abc`) is page 1. */
export function parsePageParam(value: string | null): number {
  const parsed = paginationQuerySchema.shape.page.safeParse(value ?? undefined)
  return parsed.success ? parsed.data : 1
}
