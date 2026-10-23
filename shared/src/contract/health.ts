import { z } from 'zod';

export const healthCheckResultSchema = z.object({
  status: z.enum(['up', 'down']),
  durationMs: z.number().min(0),
});

/**
 * `GET /api/health` (D50): 200 with `status: "ok"` when every check is up, 503 with
 * `status: "error"` when any is down. No tenant header. Checks are keyed by name, e.g. `database`.
 */
export const healthReportSchema = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.record(z.string(), healthCheckResultSchema),
});
export type HealthReport = z.output<typeof healthReportSchema>;
