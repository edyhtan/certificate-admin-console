import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buildPath,
  certificateDetailSchema,
  certificateListResponseSchema,
  endpoints,
  paginationQuerySchema,
  type CertificateListQuery,
  type RevokeCertificateRequest,
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
  detail: (id: number) => [...certificateKeys.all(), 'detail', id] as const,
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

export function fetchCertificate(id: number, signal?: AbortSignal) {
  return apiFetch(buildPath(endpoints.getCertificate.path, { id }), {
    schema: certificateDetailSchema,
    signal,
  })
}

/** One certificate. Pass `null` for an id that can't exist, and nothing is fetched. */
export function useCertificate(id: number | null) {
  return useQuery({
    queryKey: certificateKeys.detail(id ?? 0),
    queryFn: ({ signal }) => fetchCertificate(id!, signal),
    enabled: id !== null,
  })
}

export function revokeCertificate(id: number, reason?: string) {
  return apiFetch(buildPath(endpoints.revokeCertificate.path, { id }), {
    method: 'POST',
    body: { reason } satisfies RevokeCertificateRequest,
    schema: certificateDetailSchema,
  })
}

/**
 * Revokes a certificate. On success the detail shows the returned state at once and every list
 * page is refetched. Revoking an already revoked certificate succeeds with its current state.
 */
export function useRevokeCertificate(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason?: string) => revokeCertificate(id, reason),
    onSuccess: async (certificate) => {
      queryClient.setQueryData(certificateKeys.detail(id), certificate)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: certificateKeys.lists() }),
        // The revoke wrote an audit event
        queryClient.invalidateQueries({ queryKey: ['audit', currentTenantCode()] }),
      ])
    },
  })
}
