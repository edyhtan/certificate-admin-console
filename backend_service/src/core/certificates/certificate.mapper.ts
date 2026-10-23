import type { CertificateDetail, CertificateSummary } from '@cert/shared';
import type { Prisma } from '@prisma/client';

/** Columns a list row needs. */
export const SUMMARY_SELECT = {
  id: true,
  serial: true,
  participantId: true,
  participantName: true,
  courseId: true,
  courseTitle: true,
  status: true,
  issuedAt: true,
  revokedAt: true,
} as const satisfies Prisma.CertificateSelect;

/** Columns the detail needs, with who issued and revoked it. */
export const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  enrollmentId: true,
  revokeReason: true,
  issuedBy: { select: { id: true, name: true } },
  revokedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.CertificateSelect;

export type SummaryRow = Prisma.CertificateGetPayload<{ select: typeof SUMMARY_SELECT }>;
export type DetailRow = Prisma.CertificateGetPayload<{ select: typeof DETAIL_SELECT }>;

/** Instants leave the API as UTC ISO strings; the web app formats them in `timezone` (spec §4). */
export function toSummary(row: SummaryRow): CertificateSummary {
  return {
    id: row.id,
    serial: row.serial,
    participantId: row.participantId,
    participantName: row.participantName,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export function toDetail(row: DetailRow, timezone: string): CertificateDetail {
  return {
    ...toSummary(row),
    enrollmentId: row.enrollmentId,
    issuedBy: row.issuedBy,
    revokedBy: row.revokedBy,
    revokeReason: row.revokeReason,
    timezone,
  };
}
