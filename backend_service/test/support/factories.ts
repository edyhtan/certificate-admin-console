import type {
  Certificate,
  Course,
  Enrollment,
  Participant,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { TEST_ADMIN, testDb } from './db.js';

/**
 * Test data factories. Each creates one row with unique defaults and takes overrides.
 * Factories that need a parent create it unless one is passed in.
 * Certificates get serials `SYD-2099-…` from a local sequence, so they never clash with the
 * Sydney seed's 2026 serials; they don't touch `serial_counter`.
 */

let seq = 0;
const next = () => ++seq;

export async function createCourse(
  overrides: Partial<Prisma.CourseUncheckedCreateInput> = {},
  db: PrismaClient = testDb(),
): Promise<Course> {
  const n = next();
  return db.course.create({
    data: { code: `C${n}`, title: `Course ${n}`, ...overrides },
  });
}

export async function createParticipant(
  overrides: Partial<Prisma.ParticipantUncheckedCreateInput> = {},
  db: PrismaClient = testDb(),
): Promise<Participant> {
  const n = next();
  return db.participant.create({
    data: {
      firstName: `First${n}`,
      lastName: `Last${n}`,
      email: `participant${n}@example.com`,
      ...overrides,
    },
  });
}

export async function createEnrollment(
  options: {
    participant?: Participant;
    course?: Course;
    status?: 'enrolled' | 'completed';
    completedAt?: Date;
  } = {},
  db: PrismaClient = testDb(),
): Promise<Enrollment & { participant: Participant; course: Course }> {
  const participant = options.participant ?? (await createParticipant({}, db));
  const course = options.course ?? (await createCourse({}, db));
  const status = options.status ?? 'completed';
  const completedAt =
    options.completedAt ?? (status === 'completed' ? new Date() : null);
  return db.enrollment.create({
    data: {
      participantId: participant.id,
      courseId: course.id,
      status,
      completedAt,
    },
    include: { participant: true, course: true },
  });
}

/** An issued certificate, with the participant name and course title copied as at issue time. */
export async function createCertificate(
  options: {
    enrollment?: Enrollment & { participant: Participant; course: Course };
    serial?: string;
    issuedAt?: Date;
    revoked?: { at?: Date; reason?: string };
  } = {},
  db: PrismaClient = testDb(),
): Promise<Certificate> {
  const enrollment =
    options.enrollment ?? (await createEnrollment({ status: 'completed' }, db));
  const n = next();
  const { participant, course } = enrollment;
  return db.certificate.create({
    data: {
      enrollmentId: enrollment.id,
      participantId: participant.id,
      courseId: course.id,
      serial: options.serial ?? `SYD-2099-${String(n).padStart(6, '0')}`,
      participantName: `${participant.firstName} ${participant.lastName}`,
      courseTitle: course.title,
      issuedAt: options.issuedAt ?? new Date(),
      issuedById: TEST_ADMIN.id,
      ...(options.revoked && {
        status: 'revoked',
        revokedAt: options.revoked.at ?? new Date(),
        revokedById: TEST_ADMIN.id,
        revokeReason: options.revoked.reason ?? null,
      }),
    },
  });
}
