import type { ErrorCode, FieldErrors } from '@cert/shared';

/**
 * The one error shape every endpoint returns: `{ error, message, fields? }`.
 * Codes and the body type come from the shared contract (D51, D54).
 */
export type { ApiErrorBody, ErrorCode, FieldErrors } from '@cert/shared';

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
