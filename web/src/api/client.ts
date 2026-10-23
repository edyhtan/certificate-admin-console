import type { z } from 'zod'
import { ApiError, errorFromResponse } from './errors'
import { currentTenantCode, TENANT_HEADER } from './tenant'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue>

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Added to the URL; null, undefined and empty strings are left out. */
  query?: QueryParams
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiFetchOptions<S extends z.ZodType> extends ApiRequestOptions {
  /** Parses the JSON response. A mismatch throws `ApiError` with code `invalid_response`. */
  schema?: S
}

/** Base path of the API. The Vite dev server proxies it to the API (vite.config.ts). */
export const API_BASE = '/api'

/** `?a=1&b=x` from params, skipping empty values. Returns '' when nothing is left. */
export function buildQueryString(query: QueryParams = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * Sends a request with the tenant header and returns the raw response once it is known to be
 * 2xx. Use it directly for non-JSON responses (NDJSON stream, CSV file). Throws `ApiError`.
 */
export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
    [TENANT_HEADER]: currentTenantCode(),
  }
  const init: RequestInit = { method: options.method ?? 'GET', headers, signal: options.signal }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}${buildQueryString(options.query)}`, init)
  } catch (cause) {
    // Let aborts through unchanged so TanStack Query can recognise a cancelled query.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Network request failed')
  }

  if (!response.ok) throw await errorFromResponse(response)
  return response
}

/**
 * Calls a JSON endpoint and returns its parsed body, e.g.
 * `apiFetch('/certificates/7', { schema: certificateResponseSchema })`.
 * Without a schema the body is returned as `unknown`. `204` returns `undefined`.
 */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  options: ApiFetchOptions<S> & { schema: S },
): Promise<z.output<S>>
export async function apiFetch(path: string, options?: ApiRequestOptions): Promise<unknown>
export async function apiFetch(
  path: string,
  options: ApiFetchOptions<z.ZodType> = {},
): Promise<unknown> {
  const { schema, ...requestOptions } = options
  const response = await apiRequest(path, requestOptions)
  if (response.status === 204) return undefined

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError(response.status, 'invalid_response', 'The server sent a response that isn’t JSON')
  }
  if (!schema) return body

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'invalid_response',
      'The server sent a response this app doesn’t understand',
    )
  }
  return parsed.data
}
