import type { z } from 'zod';
import {
  auditEventListQuerySchema,
  auditEventListResponseSchema,
} from './audit-events.js';
import {
  certificateDetailSchema,
  certificateExportQuerySchema,
  certificateListQuerySchema,
  certificateListResponseSchema,
  revokeCertificateRequestSchema,
} from './certificates.js';
import { idParamSchema } from './common.js';
import {
  courseListResponseSchema,
  courseSchema,
  createCourseRequestSchema,
} from './courses.js';
import type { ErrorCode } from './errors.js';
import { healthReportSchema } from './health.js';
import {
  issuancePreviewQuerySchema,
  issuancePreviewResponseSchema,
  issueCertificatesRequestSchema,
} from './issuances.js';
import {
  createParticipantRequestSchema,
  participantSchema,
} from './participants.js';
import { tenantListResponseSchema } from './tenants.js';

export interface EndpointDefinition {
  method: 'GET' | 'POST';
  /** Full path including `/api`; `:id` marks a path parameter. */
  path: `/api/${string}`;
  /** Whether the `tenant_id` header is required (spec §5.1). */
  tenantHeader: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** `json` uses `response`; `ndjson` streams `IssuanceEvent` lines; `csv` is a file. */
  responseType: 'json' | 'ndjson' | 'csv';
  response?: z.ZodType;
  successStatus: 200 | 201;
  /** Error codes this endpoint can answer with, besides `internal_error`. */
  errors: readonly ErrorCode[];
}

/** Errors any tenant-scoped endpoint can send: bad/missing `tenant_id` and bad input. */
const TENANT = ['unknown_tenant'] as const;

/**
 * Every API endpoint. `docs/api.md` documents each one, and a test checks they stay in step.
 */
export const endpoints = {
  health: {
    method: 'GET',
    path: '/api/health',
    tenantHeader: false,
    responseType: 'json',
    response: healthReportSchema,
    successStatus: 200,
    errors: [],
  },
  listTenants: {
    method: 'GET',
    path: '/api/tenants',
    tenantHeader: false,
    responseType: 'json',
    response: tenantListResponseSchema,
    successStatus: 200,
    errors: [],
  },
  listCourses: {
    method: 'GET',
    path: '/api/courses',
    tenantHeader: true,
    responseType: 'json',
    response: courseListResponseSchema,
    successStatus: 200,
    errors: [...TENANT],
  },
  createCourse: {
    method: 'POST',
    path: '/api/courses',
    tenantHeader: true,
    body: createCourseRequestSchema,
    responseType: 'json',
    response: courseSchema,
    successStatus: 201,
    errors: [...TENANT, 'validation_failed', 'bad_request', 'duplicate'],
  },
  createParticipant: {
    method: 'POST',
    path: '/api/participants',
    tenantHeader: true,
    body: createParticipantRequestSchema,
    responseType: 'json',
    response: participantSchema,
    successStatus: 201,
    errors: [...TENANT, 'validation_failed', 'bad_request', 'duplicate'],
  },
  listCertificates: {
    method: 'GET',
    path: '/api/certificates',
    tenantHeader: true,
    query: certificateListQuerySchema,
    responseType: 'json',
    response: certificateListResponseSchema,
    successStatus: 200,
    errors: [...TENANT, 'validation_failed'],
  },
  exportCertificates: {
    method: 'GET',
    path: '/api/certificates/export.csv',
    tenantHeader: true,
    query: certificateExportQuerySchema,
    responseType: 'csv',
    successStatus: 200,
    errors: [...TENANT, 'validation_failed'],
  },
  getCertificate: {
    method: 'GET',
    path: '/api/certificates/:id',
    tenantHeader: true,
    params: idParamSchema,
    responseType: 'json',
    response: certificateDetailSchema,
    successStatus: 200,
    errors: [...TENANT, 'validation_failed', 'not_found'],
  },
  revokeCertificate: {
    method: 'POST',
    path: '/api/certificates/:id/revoke',
    tenantHeader: true,
    params: idParamSchema,
    body: revokeCertificateRequestSchema,
    responseType: 'json',
    response: certificateDetailSchema,
    successStatus: 200,
    errors: [...TENANT, 'validation_failed', 'bad_request', 'not_found'],
  },
  previewIssuance: {
    method: 'GET',
    path: '/api/issuances/preview',
    tenantHeader: true,
    query: issuancePreviewQuerySchema,
    responseType: 'json',
    response: issuancePreviewResponseSchema,
    successStatus: 200,
    errors: [...TENANT, 'validation_failed', 'not_found'],
  },
  issueCertificates: {
    method: 'POST',
    path: '/api/issuances',
    tenantHeader: true,
    body: issueCertificatesRequestSchema,
    responseType: 'ndjson',
    successStatus: 200,
    errors: [...TENANT, 'validation_failed', 'bad_request', 'not_found'],
  },
  listAuditEvents: {
    method: 'GET',
    path: '/api/audit-events',
    tenantHeader: true,
    query: auditEventListQuerySchema,
    responseType: 'json',
    response: auditEventListResponseSchema,
    successStatus: 200,
    errors: [...TENANT, 'validation_failed'],
  },
} as const satisfies Record<string, EndpointDefinition>;

export type EndpointName = keyof typeof endpoints;

/** Fills `:param` placeholders, e.g. `buildPath('/api/certificates/:id', { id: 7 })`. */
export function buildPath(
  path: string,
  params: Record<string, string | number> = {},
): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
}
