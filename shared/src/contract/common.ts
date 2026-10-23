import { z } from 'zod';

/** Query strings arrive as strings, and `?q=` as ''. Treat '' as "not given". */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** An optional query parameter: '' and missing both mean "not given". */
export function optionalParam<S extends z.ZodType>(schema: S) {
  return z.preprocess(emptyToUndefined, schema.optional());
}

/** A positive integer id, from JSON or from a query/path string. */
export const idSchema = z.coerce
  .number({ error: 'must be a number' })
  .int({ error: 'must be a whole number' })
  .positive({ error: 'must be a positive id' });

/** Path parameter `:id`. */
export const idParamSchema = z.object({ id: idSchema });
export type IdParam = z.output<typeof idParamSchema>;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** `page` from 1; `pageSize` 1–100, default 20. */
export const paginationQuerySchema = z.object({
  page: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: 'must be a number' })
      .int({ error: 'must be a whole number' })
      .min(1, { error: 'must be 1 or more' })
      .default(1),
  ),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: 'must be a number' })
      .int({ error: 'must be a whole number' })
      .min(1, { error: 'must be 1 or more' })
      .max(MAX_PAGE_SIZE, { error: `must be ${MAX_PAGE_SIZE} or less` })
      .default(DEFAULT_PAGE_SIZE),
  ),
});
export type PaginationQuery = z.output<typeof paginationQuerySchema>;

/**
 * A UTC instant as ISO-8601 with `Z`, e.g. `2026-12-31T15:30:00.000Z`.
 * The API never formats dates for display; the web app does, in the tenant's `timezone` (spec §4).
 */
export const instantSchema = z.iso.datetime({ offset: false });

/** IANA time zone name, e.g. `Australia/Sydney`. Never a fixed offset (spec §4). */
export const timeZoneSchema = z.string().min(1);

/** Who acted: the tenant database's `admin` row. */
export const actorSchema = z.object({ id: z.number().int(), name: z.string() });
export type Actor = z.output<typeof actorSchema>;

/** A page of results. Lists with instants also carry the tenant `timezone`. */
export function pageSchema<S extends z.ZodType>(item: S) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
    timezone: timeZoneSchema,
  });
}
