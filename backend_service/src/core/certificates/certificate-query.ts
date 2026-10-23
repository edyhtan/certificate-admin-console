import type {
  CertificateExportQuery,
  CertificateSort,
} from '@cert/shared';
import type { Prisma } from '@prisma/client';

/** API sort names → certificate columns. Only these can be sorted on (spec §5.3). */
const SORT_COLUMNS = {
  issued_at: 'issuedAt',
  participant_name: 'participantName',
  serial: 'serial',
  course_title: 'courseTitle',
} as const satisfies Record<CertificateSort, keyof Prisma.CertificateOrderByWithRelationInput>;

/**
 * Escapes LIKE wildcards. Prisma passes `contains` / `startsWith` text to MySQL's LIKE
 * without escaping, so a search for `%` or `_` would otherwise match every row.
 * Backslash is MySQL's default LIKE escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface CertificateQuery {
  where: Prisma.CertificateWhereInput;
  /** Sort column, then id in the same direction, so equal values keep a stable order. */
  orderBy: Prisma.CertificateOrderByWithRelationInput[];
}

/**
 * The one place that turns search, filters and sort into Prisma `where` / `orderBy`.
 * The list and the CSV export both use it, so the export always matches the screen (spec §5.5).
 *
 * - `q`: participant name contains it, or serial starts with it. Case and accents are ignored by
 *   the column collation (`nguyen` finds `Nguyễn`, `syd-2026` finds `SYD-2026-…`).
 * - `status`, `courseId`: exact filters.
 */
export function buildCertificateQuery(query: CertificateExportQuery): CertificateQuery {
  const where: Prisma.CertificateWhereInput = {};
  if (query.q !== undefined) {
    const text = escapeLike(query.q);
    where.OR = [
      { participantName: { contains: text } },
      { serial: { startsWith: text } },
    ];
  }
  if (query.status !== undefined) where.status = query.status;
  if (query.courseId !== undefined) where.courseId = query.courseId;

  const column = SORT_COLUMNS[query.sort];
  return {
    where,
    orderBy: [{ [column]: query.order }, { id: query.order }],
  };
}
