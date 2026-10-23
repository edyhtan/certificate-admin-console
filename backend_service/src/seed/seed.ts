import type { Prisma, PrismaClient } from '@prisma/client';
import type { SeedProfile } from './seed-profile.js';

/** Ids of the rows a seed created, by natural key. */
export interface SeedResult {
  adminId: number;
  courses: Record<string, number>;
  participants: Record<string, number>;
  certificates: Record<string, number>;
  counts: {
    courses: number;
    participants: number;
    enrollments: number;
    certificates: number;
    auditEvents: number;
  };
}

/** `SYD-2026-000123` → `{ year: 2026, sequence: 123 }`; the prefix must match. */
export function parseSerial(
  serial: string,
  prefix: string,
): { year: number; sequence: number } {
  const match = /^([A-Z]{3})-(\d{4})-(\d{6})$/.exec(serial);
  if (!match || match[1] !== prefix) {
    throw new Error(`serial ${serial} is not ${prefix}-YYYY-NNNNNN`);
  }
  return { year: Number(match[2]), sequence: Number(match[3]) };
}

/** One `serial_counter` row per year, at the highest seeded sequence of that year. */
export function serialCounters(
  profile: SeedProfile,
): { year: number; lastValue: number }[] {
  const highest = new Map<number, number>();
  for (const c of profile.certificates) {
    const { year, sequence } = parseSerial(c.serial, profile.serialPrefix);
    highest.set(year, Math.max(highest.get(year) ?? 0, sequence));
  }
  return [...highest]
    .sort(([a], [b]) => a - b)
    .map(([year, lastValue]) => ({ year, lastValue }));
}

/** True once the database has its `admin` row, i.e. it has been seeded. */
export async function isSeeded(db: PrismaClient): Promise<boolean> {
  return (await db.admin.count()) > 0;
}

function lookup<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key);
  if (value === undefined) throw new Error(`seed: unknown ${what} ${key}`);
  return value;
}

/**
 * Writes a profile's rows into an empty database, all in one transaction, so a failed seed
 * leaves nothing behind. Audit events are written in time order, with the certificate's
 * names copied as at issue time.
 */
export async function seed(
  db: PrismaClient,
  profile: SeedProfile,
): Promise<SeedResult> {
  return db.$transaction(async (tx) => insertProfile(tx, profile), {
    timeout: 30_000,
  });
}

async function insertProfile(
  tx: Prisma.TransactionClient,
  profile: SeedProfile,
): Promise<SeedResult> {
  const admin = await tx.admin.create({ data: profile.admin });

  const courses = new Map<string, { id: number; title: string }>();
  for (const c of profile.courses) {
    const row = await tx.course.create({ data: c });
    courses.set(c.code, { id: row.id, title: row.title });
  }

  const participants = new Map<string, { id: number; name: string }>();
  for (const p of profile.participants) {
    const row = await tx.participant.create({ data: p });
    participants.set(p.email, {
      id: row.id,
      name: `${row.firstName} ${row.lastName}`,
    });
  }

  const enrollments = new Map<string, number>();
  for (const e of profile.enrollments) {
    const row = await tx.enrollment.create({
      data: {
        participantId: lookup(participants, e.participant, 'participant').id,
        courseId: lookup(courses, e.course, 'course').id,
        status: e.status,
        enrolledAt: new Date(e.enrolledAt),
        completedAt: e.completedAt ? new Date(e.completedAt) : null,
      },
    });
    enrollments.set(`${e.participant}|${e.course}`, row.id);
  }

  const certificates: Record<string, number> = {};
  const events: Prisma.AuditEventCreateManyInput[] = [];
  for (const c of profile.certificates) {
    const participant = lookup(participants, c.participant, 'participant');
    const course = lookup(courses, c.course, 'course');
    const row = await tx.certificate.create({
      data: {
        enrollmentId: lookup(enrollments, `${c.participant}|${c.course}`, 'enrollment'),
        participantId: participant.id,
        courseId: course.id,
        serial: c.serial,
        participantName: participant.name,
        courseTitle: course.title,
        issuedAt: new Date(c.issuedAt),
        issuedById: admin.id,
        ...(c.revoked && {
          status: 'revoked',
          revokedAt: new Date(c.revoked.at),
          revokedById: admin.id,
          revokeReason: c.revoked.reason,
        }),
      },
    });
    certificates[c.key] = row.id;

    const what = {
      actorId: admin.id,
      actorName: admin.name,
      courseId: course.id,
      courseTitle: course.title,
      participantId: participant.id,
      participantName: participant.name,
      certificateId: row.id,
      serial: c.serial,
    };
    events.push({
      ...what,
      action: 'certificate.issued',
      occurredAt: new Date(c.issuedAt),
    });
    if (c.revoked) {
      events.push({
        ...what,
        action: 'certificate.revoked',
        occurredAt: new Date(c.revoked.at),
        details: { reason: c.revoked.reason },
      });
    }
  }

  events.sort((a, b) => +new Date(a.occurredAt!) - +new Date(b.occurredAt!));
  for (const event of events) await tx.auditEvent.create({ data: event });

  for (const counter of serialCounters(profile)) {
    await tx.serialCounter.create({ data: counter });
  }

  return {
    adminId: admin.id,
    courses: Object.fromEntries([...courses].map(([code, c]) => [code, c.id])),
    participants: Object.fromEntries(
      [...participants].map(([email, p]) => [email, p.id]),
    ),
    certificates,
    counts: {
      courses: courses.size,
      participants: participants.size,
      enrollments: enrollments.size,
      certificates: profile.certificates.length,
      auditEvents: events.length,
    },
  };
}
