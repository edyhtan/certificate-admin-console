import { endpoints, healthReportSchema, type HealthReport } from '@cert/shared'
import { ApiError, errorFromResponse } from './errors'

/**
 * `GET /api/health` (D50). Unlike other calls it sends no tenant header, and a `503` is an
 * answer rather than a failure: its body says which checks are down. Throws `ApiError` when
 * there is no answer, another status, or a body that isn't a health report.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  let response: Response
  try {
    response = await fetch(endpoints.health.path, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Network request failed')
  }

  if (response.status !== 200 && response.status !== 503) throw await errorFromResponse(response)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError(response.status, 'invalid_response', 'The server sent a response that isn’t JSON')
  }
  const parsed = healthReportSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(response.status, 'invalid_response', 'The server sent a response this app doesn’t understand')
  }
  return parsed.data
}

/** Names of the checks that are down, e.g. `['admin']`. */
export function downChecks(report: HealthReport): string[] {
  return Object.entries(report.checks)
    .filter(([, check]) => check.status === 'down')
    .map(([name]) => name)
}
