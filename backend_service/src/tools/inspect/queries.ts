import { PrismaClient, type Prisma } from '@prisma/client';

/** Prisma operations that change data. The inspector refuses all of them. */
export const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  '$executeRaw',
  '$executeRawUnsafe',
  '$runCommandRaw',
]);

export class ReadOnlyError extends Error {
  constructor(operation: string) {
    super(`the inspector is read-only; refused ${operation}`);
    this.name = 'ReadOnlyError';
  }
}

/** A Prisma client on one tenant database that throws on any write. */
export function readOnlyClient(databaseUrl: string) {
  return new PrismaClient({ datasourceUrl: databaseUrl }).$extends({
    name: 'read-only',
    query: {
      $allOperations({ operation, args, query }) {
        if (WRITE_OPERATIONS.has(operation)) throw new ReadOnlyError(operation);
        return query(args);
      },
    },
  });
}

export type InspectorDb = ReturnType<typeof readOnlyClient>;

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DEFAULT_PAGE_SIZE = 15;
export const MAX_PAGE_SIZE = 100;

/** Page 1 and the default size when not given; size capped at MAX_PAGE_SIZE. */
export function normalisePage(req: PageRequest = {}): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = Math.max(1, Math.floor(req.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(req.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Number of the last page (at least 1). */
export function lastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---- summary -------------------------------------------------------------------------------

export interface TenantSummary {
  admins: number;
  courses: number;
  participants: number;
  enrollments: number;
  completedEnrollments: number;
  /** Completed enrollments without a certificate: what bulk issue would issue. */
  eligible: number;
  validCertificates: number;
  revokedCertificates: number;
  auditEvents: number;
  serialCounters: { year: number; lastValue: number }[];
  lastIssuedAt: Date | null;
}

export async function summary(db: InspectorDb): Promise<TenantSummary> {
  const [
    admins,
    courses,
    participants,
    enrollments,
    completedEnrollments,
    eligible,
    validCertificates,
    revokedCertificates,
    auditEvents,
    serialCounters,
    last,
  ] = await Promise.all([
    db.admin.count(),
    db.course.count(),
    db.participant.count(),
    db.enrollment.count(),
    db.enrollment.count({ where: { status: 'completed' } }),
    db.enrollment.count({ where: { status: 'completed', certificate: { is: null } } }),
    db.certificate.count({ where: { status: 'valid' } }),
    db.certificate.count({ where: { status: 'revoked' } }),
    db.auditEvent.count(),
    db.serialCounter.findMany({ orderBy: { year: 'asc' } }),
    db.certificate.findFirst({
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      select: { issuedAt: true },
    }),
  ]);
  return {
    admins,
    courses,
    participants,
    enrollments,
    completedEnrollments,
    eligible,
    validCertificates,
    revokedCertificates,
    auditEvents,
    serialCounters: serialCounters.map((s) => ({ year: s.year, lastValue: s.lastValue })),
    lastIssuedAt: last?.issuedAt ?? null,
  };
}

// ---- courses -------------------------------------------------------------------------------

export interface CourseRow {
  id: number;
  code: string;
  title: string;
  enrolled: number;
  completed: number;
  eligible: number;
  validCertificates: number;
  revokedCertificates: number;
}

export async function courses(db: InspectorDb): Promise<CourseRow[]> {
  const list = await db.course.findMany({ orderBy: { code: 'asc' } });
  return Promise.all(
    list.map(async (c) => {
      const [enrolled, completed, eligible, valid, revoked] = await Promise.all([
        db.enrollment.count({ where: { courseId: c.id, status: 'enrolled' } }),
        db.enrollment.count({ where: { courseId: c.id, status: 'completed' } }),
        db.enrollment.count({
          where: { courseId: c.id, status: 'completed', certificate: { is: null } },
        }),
        db.certificate.count({ where: { courseId: c.id, status: 'valid' } }),
        db.certificate.count({ where: { courseId: c.id, status: 'revoked' } }),
      ]);
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        enrolled,
        completed,
        eligible,
        validCertificates: valid,
        revokedCertificates: revoked,
      };
    }),
  );
}

export interface EnrollmentRow {
  enrollmentId: number;
  participantId: number;
  participantName: string;
  email: string;
  courseCode: string;
  courseTitle: string;
  status: 'enrolled' | 'completed';
  enrolledAt: Date;
  completedAt: Date | null;
  certificate: { id: number; serial: string; status: 'valid' | 'revoked' } | null;
}

const enrollmentInclude = {
  participant: true,
  course: true,
  certificate: { select: { id: true, serial: true, status: true } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentWithRelations = Prisma.EnrollmentGetPayload<{
  include: typeof enrollmentInclude;
}>;

function toEnrollmentRow(e: EnrollmentWithRelations): EnrollmentRow {
  return {
    enrollmentId: e.id,
    participantId: e.participantId,
    participantName: `${e.participant.firstName} ${e.participant.lastName}`,
    email: e.participant.email,
    courseCode: e.course.code,
    courseTitle: e.course.title,
    status: e.status,
    enrolledAt: e.enrolledAt,
    completedAt: e.completedAt,
    certificate: e.certificate,
  };
}

export interface CourseDetail {
  course: { id: number; code: string; title: string };
  enrollments: EnrollmentRow[];
}

/** A course by code (case-insensitive) or id, with every enrollment. */
export async function courseDetail(
  db: InspectorDb,
  codeOrId: string,
): Promise<CourseDetail | null> {
  const asId = /^\d+$/.test(codeOrId) ? Number(codeOrId) : undefined;
  const course = await db.course.findFirst({
    where: asId ? { id: asId } : { code: codeOrId.trim().toUpperCase() },
  });
  if (!course) return null;
  const enrollments = await db.enrollment.findMany({
    where: { courseId: course.id },
    include: enrollmentInclude,
    orderBy: [{ status: 'asc' }, { participant: { lastName: 'asc' } }, { id: 'asc' }],
  });
  return {
    course: { id: course.id, code: course.code, title: course.title },
    enrollments: enrollments.map(toEnrollmentRow),
  };
}

// ---- participants --------------------------------------------------------------------------

export interface ParticipantRow {
  id: number;
  name: string;
  email: string;
  enrollments: number;
  certificates: number;
}

export async function participants(
  db: InspectorDb,
  req: PageRequest = {},
): Promise<Page<ParticipantRow>> {
  const { page, pageSize, skip } = normalisePage(req);
  const [total, rows] = await Promise.all([
    db.participant.count(),
    db.participant.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      skip,
      take: pageSize,
      include: { _count: { select: { enrollments: true, certificates: true } } },
    }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      email: p.email,
      enrollments: p._count.enrollments,
      certificates: p._count.certificates,
    })),
    page,
    pageSize,
    total,
  };
}

export interface ParticipantDetail {
  participant: { id: number; name: string; email: string };
  enrollments: EnrollmentRow[];
}

/** A participant by email (case-insensitive) or id, with every enrollment. */
export async function participantDetail(
  db: InspectorDb,
  emailOrId: string,
): Promise<ParticipantDetail | null> {
  const asId = /^\d+$/.test(emailOrId) ? Number(emailOrId) : undefined;
  const p = await db.participant.findFirst({
    where: asId ? { id: asId } : { email: emailOrId.trim().toLowerCase() },
  });
  if (!p) return null;
  const enrollments = await db.enrollment.findMany({
    where: { participantId: p.id },
    include: enrollmentInclude,
    orderBy: [{ course: { code: 'asc' } }, { id: 'asc' }],
  });
  return {
    participant: { id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email },
    enrollments: enrollments.map(toEnrollmentRow),
  };
}

// ---- certificates --------------------------------------------------------------------------

export interface CertificateFilter extends PageRequest {
  /** Participant name contains it, or serial starts with it. */
  q?: string;
  status?: 'valid' | 'revoked';
}

export interface CertificateRow {
  id: number;
  serial: string;
  participantName: string;
  courseTitle: string;
  status: 'valid' | 'revoked';
  issuedAt: Date;
}

export async function certificates(
  db: InspectorDb,
  filter: CertificateFilter = {},
): Promise<Page<CertificateRow>> {
  const { page, pageSize, skip } = normalisePage(filter);
  const q = filter.q?.trim();
  const where: Prisma.CertificateWhereInput = {
    ...(q
      ? { OR: [{ participantName: { contains: q } }, { serial: { startsWith: q } }] }
      : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };
  const [total, rows] = await Promise.all([
    db.certificate.count({ where }),
    db.certificate.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        serial: true,
        participantName: true,
        courseTitle: true,
        status: true,
        issuedAt: true,
      },
    }),
  ]);
  return { items: rows, page, pageSize, total };
}

export interface AuditRow {
  id: number;
  occurredAt: Date;
  action: string;
  actorName: string;
  courseTitle: string;
  participantName: string;
  serial: string;
  certificateId: number;
  details: unknown;
}

export interface CertificateDetail {
  id: number;
  serial: string;
  status: 'valid' | 'revoked';
  participantId: number;
  participantName: string;
  courseCode: string;
  courseTitle: string;
  enrollmentId: number;
  issuedAt: Date;
  issuedBy: string;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  auditEvents: AuditRow[];
}

const auditSelect = {
  id: true,
  occurredAt: true,
  action: true,
  actorName: true,
  courseTitle: true,
  participantName: true,
  serial: true,
  certificateId: true,
  details: true,
} satisfies Prisma.AuditEventSelect;

/** A certificate by serial (case-insensitive) or id, with its audit trail (oldest first). */
export async function certificateDetail(
  db: InspectorDb,
  serialOrId: string,
): Promise<CertificateDetail | null> {
  const asId = /^\d+$/.test(serialOrId) ? Number(serialOrId) : undefined;
  const c = await db.certificate.findFirst({
    where: asId ? { id: asId } : { serial: serialOrId.trim().toUpperCase() },
    include: {
      course: { select: { code: true } },
      issuedBy: { select: { name: true } },
      revokedBy: { select: { name: true } },
      auditEvents: {
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: auditSelect,
      },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    serial: c.serial,
    status: c.status,
    participantId: c.participantId,
    participantName: c.participantName,
    courseCode: c.course.code,
    courseTitle: c.courseTitle,
    enrollmentId: c.enrollmentId,
    issuedAt: c.issuedAt,
    issuedBy: c.issuedBy.name,
    revokedAt: c.revokedAt,
    revokedBy: c.revokedBy?.name ?? null,
    revokeReason: c.revokeReason,
    auditEvents: c.auditEvents,
  };
}

// ---- audit log -----------------------------------------------------------------------------

export interface AuditFilter extends PageRequest {
  action?: string;
}

/** Audit events, newest first. */
export async function auditLog(
  db: InspectorDb,
  filter: AuditFilter = {},
): Promise<Page<AuditRow>> {
  const { page, pageSize, skip } = normalisePage(filter);
  const where: Prisma.AuditEventWhereInput = filter.action ? { action: filter.action } : {};
  const [total, items] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      select: auditSelect,
    }),
  ]);
  return { items, page, pageSize, total };
}
