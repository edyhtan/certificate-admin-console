import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  auditActionSchema,
  auditEventListResponseSchema,
  endpoints,
  idSchema,
  type AuditAction,
  type AuditEventListQuery,
} from '@cert/shared'
import { apiFetch } from '../../api/client'
import { currentTenantCode } from '../../api/tenant'
import { parsePageParam } from '../certificates/api'

export type AuditFilters = Partial<AuditEventListQuery>

export const auditKeys = {
  all: () => ['audit', currentTenantCode()] as const,
  list: (params: AuditFilters) => [...auditKeys.all(), 'list', params] as const,
}

export function fetchAuditEvents(params: AuditFilters, signal?: AbortSignal) {
  return apiFetch(endpoints.listAuditEvents.path, {
    query: params,
    schema: auditEventListResponseSchema,
    signal,
  })
}

/** Audit events, newest first. Keeps the previous page on screen while the next one loads. */
export function useAuditEvents(params: AuditFilters) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: ({ signal }) => fetchAuditEvents(params, signal),
    placeholderData: keepPreviousData,
  })
}

export const actionLabels: Record<AuditAction, string> = {
  'certificate.issued': 'Issued',
  'certificate.revoked': 'Revoked',
}

/** The audit page's view state, from the URL. Invalid values are ignored. */
export interface AuditPageParams {
  courseId?: number
  action?: AuditAction
  page: number
}

export function parseAuditParams(search: URLSearchParams): AuditPageParams {
  const course = idSchema.safeParse(search.get('courseId') || undefined)
  const action = auditActionSchema.safeParse(search.get('action') || undefined)
  return {
    courseId: course.success ? course.data : undefined,
    action: action.success ? action.data : undefined,
    page: parsePageParam(search.get('page')),
  }
}

export function auditSearchParams(params: AuditPageParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.courseId) search.set('courseId', String(params.courseId))
  if (params.action) search.set('action', params.action)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

/** Link to the audit log filtered to one course's issuances, e.g. after a bulk issue run. */
export function auditLogLink(courseId: number, action: AuditAction = 'certificate.issued'): string {
  return `/audit?${auditSearchParams({ courseId, action, page: 1 }).toString()}`
}

/** A revoke reason or other detail worth showing, from the event's `details`. */
export function auditDetail(details: Record<string, unknown> | null): string | null {
  const reason = details?.reason
  return typeof reason === 'string' && reason.trim() ? reason : null
}
