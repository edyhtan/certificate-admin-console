import { z } from 'zod';

export const participantSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});
export type Participant = z.output<typeof participantSchema>;

const nameSchema = z
  .string({ error: 'is required' })
  .trim()
  .min(1, { error: 'is required' })
  .max(100, { error: 'must be 100 characters or less' });

/**
 * `POST /api/participants` (spec §5.6).
 * Names: 1–100 chars after trimming; accents and apostrophes allowed.
 * `email`: trimmed and lower-cased before saving, so `Ana@X.com` and `ana@x.com` are one person.
 */
export const createParticipantRequestSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: z
    .string({ error: 'is required' })
    .trim()
    .toLowerCase()
    .max(254, { error: 'must be 254 characters or less' })
    .pipe(z.email({ error: 'must be a valid email address' })),
});
export type CreateParticipantRequest = z.input<
  typeof createParticipantRequestSchema
>;
export type CreateParticipant = z.output<typeof createParticipantRequestSchema>;
