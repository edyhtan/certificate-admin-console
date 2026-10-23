import { z } from 'zod';

export const courseSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  title: z.string(),
});
export type Course = z.output<typeof courseSchema>;

/** `GET /api/courses`: all courses, by title. */
export const courseListResponseSchema = z.object({
  items: z.array(courseSchema),
});
export type CourseListResponse = z.output<typeof courseListResponseSchema>;

/**
 * `POST /api/courses` (spec §5.6).
 * `code`: trimmed and upper-cased, then 2–20 of `A–Z 0–9 -`. `title`: 1–200 chars after trimming.
 */
export const createCourseRequestSchema = z.object({
  code: z
    .string({ error: 'is required' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, {
      error: 'must be 2–20 letters, digits or hyphens',
    }),
  title: z
    .string({ error: 'is required' })
    .trim()
    .min(1, { error: 'is required' })
    .max(200, { error: 'must be 200 characters or less' }),
});
/** What the client sends. */
export type CreateCourseRequest = z.input<typeof createCourseRequestSchema>;
/** What the API works with after validation (trimmed, upper-cased). */
export type CreateCourse = z.output<typeof createCourseRequestSchema>;
