import { z } from 'zod';
import { idSchema } from './common.js';

/** `GET /api/issuances/preview?courseId=` query. */
export const issuancePreviewQuerySchema = z.object({
  courseId: idSchema,
});
export type IssuancePreviewQuery = z.output<typeof issuancePreviewQuerySchema>;

/** Counts shown before a bulk issue: "Issue {eligible} certificates" (D41). */
export const issuancePreviewResponseSchema = z.object({
  courseId: z.number().int(),
  /** Enrollments with status `completed`. */
  completed: z.number().int().min(0),
  /** Of those, how many already hold a certificate (valid or revoked). */
  alreadyIssued: z.number().int().min(0),
  /** `completed - alreadyIssued`: what a run would issue now. */
  eligible: z.number().int().min(0),
});
export type IssuancePreviewResponse = z.output<
  typeof issuancePreviewResponseSchema
>;

/** `POST /api/issuances` body: issue to every eligible learner of the course (D5). */
export const issueCertificatesRequestSchema = z.object({
  courseId: idSchema,
});
export type IssueCertificatesRequest = z.input<
  typeof issueCertificatesRequestSchema
>;

export const SKIP_REASONS = ['already_issued', 'revoked'] as const;
export const skipReasonSchema = z.enum(SKIP_REASONS);
export type SkipReason = z.output<typeof skipReasonSchema>;

const resultBase = {
  type: z.literal('result'),
  enrollmentId: z.number().int(),
  participantName: z.string(),
};

/** One learner's outcome. Each learner is its own transaction (D8). */
export const issuanceResultEventSchema = z.discriminatedUnion('outcome', [
  z.object({
    ...resultBase,
    outcome: z.literal('issued'),
    serial: z.string(),
  }),
  z.object({
    ...resultBase,
    outcome: z.literal('skipped'),
    reason: skipReasonSchema,
  }),
  z.object({
    ...resultBase,
    outcome: z.literal('failed'),
    message: z.string(),
  }),
]);
export type IssuanceResultEvent = z.output<typeof issuanceResultEventSchema>;
export type IssuanceOutcome = IssuanceResultEvent['outcome'];

export const issuanceStartEventSchema = z.object({
  type: z.literal('start'),
  /** Completed enrollments the run will go through (issued + skipped + failed at the end). */
  total: z.number().int().min(0),
});

export const issuanceDoneEventSchema = z.object({
  type: z.literal('done'),
  issued: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
});

/**
 * `POST /api/issuances` streams `application/x-ndjson`: one JSON object per line,
 * `start`, then one `result` per candidate as it is processed, then `done` (spec §5.2, D30).
 * Errors found before the stream starts (bad body, unknown course) use the normal error shape.
 */
export const issuanceEventSchema = z.union([
  issuanceStartEventSchema,
  issuanceResultEventSchema,
  issuanceDoneEventSchema,
]);
export type IssuanceEvent = z.output<typeof issuanceEventSchema>;
export type IssuanceStartEvent = z.output<typeof issuanceStartEventSchema>;
export type IssuanceDoneEvent = z.output<typeof issuanceDoneEventSchema>;

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';
