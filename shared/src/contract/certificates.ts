import { z } from 'zod';
import {
  actorSchema,
  idSchema,
  instantSchema,
  optionalParam,
  pageSchema,
  paginationQuerySchema,
  timeZoneSchema,
} from './common.js';

export const CERTIFICATE_STATUSES = ['valid', 'revoked'] as const;
export const certificateStatusSchema = z.enum(CERTIFICATE_STATUSES);
export type CertificateStatus = z.output<typeof certificateStatusSchema>;

export const CERTIFICATE_SORTS = [
  'issued_at',
  'participant_name',
  'serial',
  'course_title',
] as const;
export const certificateSortSchema = z.enum(CERTIFICATE_SORTS, {
  error: `must be one of ${CERTIFICATE_SORTS.join(', ')}`,
});
export type CertificateSort = z.output<typeof certificateSortSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc'], {
  error: 'must be asc or desc',
});
export type SortOrder = z.output<typeof sortOrderSchema>;

export const MAX_SEARCH_LENGTH = 100;

/** Search, filters and sort shared by the list and the CSV export (spec §5.3, §5.5). */
const filterShape = {
  /** Partial match on participant name, or prefix match on serial. Case- and accent-insensitive. */
  q: optionalParam(
    z
      .string()
      .trim()
      .max(MAX_SEARCH_LENGTH, {
        error: `must be ${MAX_SEARCH_LENGTH} characters or less`,
      })
      .transform((s) => (s === '' ? undefined : s)),
  ),
  status: optionalParam(certificateStatusSchema),
  courseId: optionalParam(idSchema),
  sort: optionalParam(certificateSortSchema),
  order: optionalParam(sortOrderSchema),
};

/**
 * Fills in the sort defaults: `issued_at` newest first; text columns A→Z.
 * The API always adds the id as a tie-breaker, in the same direction.
 */
function withSortDefaults<
  T extends { sort?: CertificateSort; order?: SortOrder },
>(query: T) {
  const sort = query.sort ?? 'issued_at';
  const order = query.order ?? (sort === 'issued_at' ? 'desc' : 'asc');
  return { ...query, sort, order };
}

/** `GET /api/certificates` query. */
export const certificateListQuerySchema = z
  .object({ ...filterShape, ...paginationQuerySchema.shape })
  .transform(withSortDefaults);
export type CertificateListQuery = z.output<typeof certificateListQuerySchema>;
/** What the client may put in the query string. */
export type CertificateListParams = z.input<typeof certificateListQuerySchema>;

/** `GET /api/certificates/export.csv` query: the list's filters and sort, no paging. */
export const certificateExportQuerySchema = z
  .object(filterShape)
  .transform(withSortDefaults);
export type CertificateExportQuery = z.output<
  typeof certificateExportQuerySchema
>;
export type CertificateExportParams = z.input<
  typeof certificateExportQuerySchema
>;

/** One row of the list. Instants are UTC; format them in the response's `timezone`. */
export const certificateSummarySchema = z.object({
  id: z.number().int(),
  serial: z.string(),
  participantId: z.number().int(),
  participantName: z.string(),
  courseId: z.number().int(),
  courseTitle: z.string(),
  status: certificateStatusSchema,
  issuedAt: instantSchema,
  revokedAt: instantSchema.nullable(),
});
export type CertificateSummary = z.output<typeof certificateSummarySchema>;

/** `GET /api/certificates` response. */
export const certificateListResponseSchema = pageSchema(
  certificateSummarySchema,
);
export type CertificateListResponse = z.output<
  typeof certificateListResponseSchema
>;

/**
 * `GET /api/certificates/:id` and `POST /api/certificates/:id/revoke` response.
 * The audit trail comes from `GET /api/audit-events?certificateId=` (D42).
 */
export const certificateDetailSchema = certificateSummarySchema.extend({
  enrollmentId: z.number().int(),
  issuedBy: actorSchema,
  revokedBy: actorSchema.nullable(),
  revokeReason: z.string().nullable(),
  timezone: timeZoneSchema,
});
export type CertificateDetail = z.output<typeof certificateDetailSchema>;

export const MAX_REVOKE_REASON_LENGTH = 500;

/**
 * `POST /api/certificates/:id/revoke` body. `reason` is optional; blank means none.
 * A missing body counts as `{}`. Revoking twice answers 200 with the current state (spec §5.4).
 */
export const revokeCertificateRequestSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    reason: optionalParam(
      z
        .string()
        .trim()
        .max(MAX_REVOKE_REASON_LENGTH, {
          error: `must be ${MAX_REVOKE_REASON_LENGTH} characters or less`,
        })
        .transform((s) => (s === '' ? undefined : s)),
    ),
  }),
);
export type RevokeCertificateRequest = z.input<
  typeof revokeCertificateRequestSchema
>;
export type RevokeCertificate = z.output<typeof revokeCertificateRequestSchema>;

/**
 * CSV export (spec §5.5): `text/csv; charset=utf-8` with a UTF-8 BOM, RFC 4180 quoting,
 * cells starting with `= + - @` prefixed with `'`. `issue_date` is the tenant-local `YYYY-MM-DD`.
 * File name: `certificates-<tenant code>-<local date>.csv` (Content-Disposition).
 */
export const CERTIFICATE_EXPORT_COLUMNS = [
  'learner_name',
  'course_title',
  'serial_number',
  'issue_date',
  'status',
] as const;
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
