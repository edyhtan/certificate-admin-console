import { z } from 'zod';

/** Every error code the API can send, with its HTTP status (spec D51). */
export const ERROR_STATUS = {
  validation_failed: 400,
  bad_request: 400,
  unknown_tenant: 400,
  not_found: 404,
  method_not_allowed: 405,
  duplicate: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [
  ErrorCode,
  ...ErrorCode[],
];

export const errorCodeSchema = z.enum(ERROR_CODES);

/** Field name → message. A problem with the whole input uses its name (`body`, `query`). */
export const fieldErrorsSchema = z.record(z.string(), z.string());
export type FieldErrors = z.output<typeof fieldErrorsSchema>;

/**
 * The one error shape every endpoint returns.
 * - `validation_failed`: `fields` has one message per bad field.
 * - `duplicate`: `fields` names the clashing field when it is one the API accepts (`code`, `email`).
 * - `internal_error`: never carries details.
 */
export const apiErrorBodySchema = z.object({
  error: errorCodeSchema,
  message: z.string(),
  fields: fieldErrorsSchema.optional(),
});
export type ApiErrorBody = z.output<typeof apiErrorBodySchema>;
