/**
 * The one error shape every endpoint returns: `{ error, message, fields? }`.
 * M0.T2 moves these types into the shared contract package.
 */
export type ErrorCode =
  | 'validation_failed'
  | 'bad_request'
  | 'unknown_tenant'
  | 'not_found'
  | 'method_not_allowed'
  | 'duplicate'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal_error';

/** Field name → message. A whole-input problem uses the input's name (`body`, `query`). */
export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  error: ErrorCode;
  message: string;
  fields?: FieldErrors;
}

/** An error the API reports to the caller as it is. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationFailedError extends AppError {
  constructor(fields: FieldErrors, message = 'Some fields are not valid') {
    super(400, 'validation_failed', message, fields);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class DuplicateError extends AppError {
  constructor(fields: FieldErrors, message = 'This value is already in use') {
    super(409, 'duplicate', message, fields);
  }
}
