import {
  certificateSortSchema,
  certificateStatusSchema,
  idSchema,
  MAX_SEARCH_LENGTH,
  sortOrderSchema,
  type CertificateSort,
  type CertificateStatus,
  type SortOrder,
} from '@cert/shared'
import { parsePageParam } from './api'

/**
 * The list's view state, kept in the URL so reload, back and shared links restore it (spec §6).
 * Only values that differ from the defaults are written to the URL.
 */
export interface ListParams {
  q?: string
  status?: CertificateStatus
  courseId?: number
  sort: CertificateSort
  order: SortOrder
  page: number
}

export const DEFAULT_SORT: CertificateSort = 'issued_at'

/** Newest first for the issue date, A→Z for text columns (same rule as the API). */
export function defaultOrder(sort: CertificateSort): SortOrder {
  return sort === 'issued_at' ? 'desc' : 'asc'
}

function valid<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: string | null) {
  if (value === null || value === '') return undefined
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

/** Reads the URL. Values the API would reject (bad sort, unknown status, …) are ignored. */
export function parseListParams(search: URLSearchParams): ListParams {
  const rawQ = search.get('q')?.trim().slice(0, MAX_SEARCH_LENGTH)
  const sort = valid<CertificateSort>(certificateSortSchema, search.get('sort')) ?? DEFAULT_SORT
  return {
    q: rawQ ? rawQ : undefined,
    status: valid<CertificateStatus>(certificateStatusSchema, search.get('status')),
    courseId: valid<number>(idSchema, search.get('courseId')),
    sort,
    order: valid<SortOrder>(sortOrderSchema, search.get('order')) ?? defaultOrder(sort),
    page: parsePageParam(search.get('page')),
  }
}

/** Writes the state back, leaving out defaults so URLs stay short. */
export function toSearchParams(params: ListParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.courseId) search.set('courseId', String(params.courseId))
  if (params.sort !== DEFAULT_SORT) search.set('sort', params.sort)
  if (params.order !== defaultOrder(params.sort)) search.set('order', params.order)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

/** True when a search or filter narrows the list (so "no rows" means "no matches"). */
export function hasFilters(params: ListParams): boolean {
  return Boolean(params.q || params.status || params.courseId)
}

/** Clicking a column header: same column flips the order, a new column starts at its default. */
export function nextSort(params: ListParams, sort: CertificateSort): Pick<ListParams, 'sort' | 'order'> {
  if (params.sort === sort) return { sort, order: params.order === 'asc' ? 'desc' : 'asc' }
  return { sort, order: defaultOrder(sort) }
}

/** The search, filters and sort the API takes (shared by the list and the CSV export). */
export function filterQuery(params: ListParams) {
  return {
    q: params.q,
    status: params.status,
    courseId: params.courseId,
    sort: params.sort,
    order: params.order,
  }
}
