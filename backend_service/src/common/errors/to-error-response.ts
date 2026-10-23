import { HttpException } from '@nestjs/common';
import {
  AppError,
  type ApiErrorBody,
  type ErrorCode,
  type FieldErrors,
} from './app-error.js';

export interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
}

const INTERNAL: ErrorResponse = {
  status: 500,
  body: { error: 'internal_error', message: 'Something went wrong' },
};

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 404:
      return 'not_found';
    case 405:
      return 'method_not_allowed';
    case 409:
      return 'duplicate';
    case 413:
      return 'payload_too_large';
    case 415:
      return 'unsupported_media_type';
    default:
      return 'bad_request';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Prisma's known request errors, matched by shape so this module doesn't depend on Prisma. */
function isPrismaKnownError(
  e: unknown,
): e is { code: string; meta?: Record<string, unknown> } {
  return (
    isRecord(e) &&
    e.name === 'PrismaClientKnownRequestError' &&
    typeof e.code === 'string'
  );
}

/**
 * Names the clashing field from a P2002 `meta.target`.
 * An array lists the fields. A string is the unique index name; the schema names
 * API-facing unique indexes after their field (e.g. `code`, `email`) so it can be reported.
 */
function duplicateFields(target: unknown): FieldErrors | undefined {
  const names = Array.isArray(target)
    ? target.filter((t): t is string => typeof t === 'string')
    : typeof target === 'string' && /^[A-Za-z]+$/.test(target)
      ? [target]
      : [];
  if (names.length === 0) return undefined;
  return Object.fromEntries(names.map((n) => [n, 'is already in use']));
}

function fromHttpException(e: HttpException): ErrorResponse {
  const status = e.getStatus();
  if (status >= 500) return INTERNAL;
  const response = e.getResponse();
  let message = e.message;
  if (typeof response === 'string') message = response;
  else if (isRecord(response)) {
    const m = response.message;
    if (typeof m === 'string') message = m;
    else if (Array.isArray(m)) message = m.join('; ');
  }
  return { status, body: { error: codeForStatus(status), message } };
}

/**
 * Errors from Express middleware in http-errors style, e.g. the body parser's 413.
 * (Nest itself turns invalid JSON into a BadRequestException with the parser's message.)
 */
function fromHttpStyleError(e: Record<string, unknown>): ErrorResponse | null {
  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof e.statusCode === 'number'
        ? e.statusCode
        : null;
  if (status === null || status < 400 || status > 499 || e.expose !== true) {
    return null;
  }
  const message = typeof e.message === 'string' ? e.message : 'Bad request';
  return { status, body: { error: codeForStatus(status), message } };
}

/** Maps anything thrown while handling a request to the contract error shape. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof AppError) {
    const body: ApiErrorBody = {
      error: exception.code,
      message: exception.message,
    };
    if (exception.fields) body.fields = exception.fields;
    return { status: exception.status, body };
  }

  if (isPrismaKnownError(exception)) {
    if (exception.code === 'P2002') {
      const fields = duplicateFields(exception.meta?.target);
      const body: ApiErrorBody = {
        error: 'duplicate',
        message: 'This value is already in use',
      };
      if (fields) body.fields = fields;
      return { status: 409, body };
    }
    if (exception.code === 'P2025') {
      return { status: 404, body: { error: 'not_found', message: 'Not found' } };
    }
    return INTERNAL;
  }

  if (exception instanceof HttpException) return fromHttpException(exception);

  if (isRecord(exception)) {
    const httpStyle = fromHttpStyleError(exception);
    if (httpStyle) return httpStyle;
  }

  return INTERNAL;
}
