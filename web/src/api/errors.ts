/**
 * The API's error shape `{ error, message, fields? }` and codes (spec D51). These mirror
 * `backend_service/src/common/errors/app-error.ts`; replace them with the shared contract's
 * types when M0.T2 lands.
 */
export type ServerErrorCode =
  | 'validation_failed'
  | 'bad_request'
  | 'unknown_tenant'
  | 'not_found'
  | 'method_not_allowed'
  | 'duplicate'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal_error'

/** Codes the client adds: the request never got a response, or the response wasn't readable. */
export type ClientErrorCode = 'network_error' | 'invalid_response'

export type ApiErrorCode = ServerErrorCode | ClientErrorCode

export type FieldErrors = Record<string, string>

export interface ApiErrorBody {
  error: ServerErrorCode
  message: string
  fields?: FieldErrors
}

/** Thrown by the API client for every failed call. `status` is 0 when there was no response. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fields?: FieldErrors

  constructor(status: number, code: ApiErrorCode, message: string, fields?: FieldErrors) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Record<string, unknown>
  return (
    typeof body.error === 'string' &&
    typeof body.message === 'string' &&
    (body.fields === undefined || (typeof body.fields === 'object' && body.fields !== null))
  )
}

/** Builds an ApiError from a non-2xx response, using the API's error body when there is one. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (isErrorBody(body)) {
    return new ApiError(response.status, body.error, body.message, body.fields)
  }
  // Not our error shape (e.g. a proxy's 502 page): keep the status, use a generic message.
  const code: ServerErrorCode = response.status === 404 ? 'not_found' : 'internal_error'
  const message = response.status === 404 ? 'Not found' : `Request failed (${response.status})`
  return new ApiError(response.status, code, message)
}

/** A short message for people, for any error a query or mutation can throw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network_error') return 'Can’t reach the server. Check your connection.'
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}
