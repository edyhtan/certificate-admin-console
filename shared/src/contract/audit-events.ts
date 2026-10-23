import { z } from 'zod';
import {
  actorSchema,
  idSchema,
  instantSchema,
  optionalParam,
  pageSchema,
  paginationQuerySchema,
} from './common.js';

export const AUDIT_ACTIONS = ['certificate.issued', 'certificate.revoked'] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS, {
  error: `must be one of ${AUDIT_ACTIONS.join(', ')}`,
});
export type AuditAction = z.output<typeof auditActionSchema>;

/** `GET /api/audit-events` query: optional filters, paginated, newest first (spec §5.7). */
export const auditEventListQuerySchema = z.object({
  certificateId: optionalParam(idSchema),
  courseId: optionalParam(idSchema),
  action: optionalParam(auditActionSchema),
  ...paginationQuerySchema.shape,
});
export type AuditEventListQuery = z.output<typeof auditEventListQuerySchema>;
export type AuditEventListParams = z.input<typeof auditEventListQuerySchema>;

/** Who and what are copied onto the event, so it reads on its own. */
export const auditEventSchema = z.object({
  id: z.number().int(),
  occurredAt: instantSchema,
  action: auditActionSchema,
  actor: actorSchema,
  courseId: z.number().int(),
  courseTitle: z.string(),
  participantId: z.number().int(),
  participantName: z.string(),
  certificateId: z.number().int(),
  serial: z.string(),
  /** e.g. `{ "reason": "Name misspelt" }` for a revoke; null when there is nothing to add. */
  details: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEvent = z.output<typeof auditEventSchema>;

/** `GET /api/audit-events` response. */
export const auditEventListResponseSchema = pageSchema(auditEventSchema);
export type AuditEventListResponse = z.output<
  typeof auditEventListResponseSchema
>;
