import { inject } from 'vitest';
import { toErrorResponse } from '../src/common/errors/to-error-response.js';
import { resetDatabase, TEST_ADMIN, testDatabaseName, testDb } from './support/db.js';
import {
  createCertificate,
  createCourse,
  createEnrollment,
  createParticipant,
} from './support/factories.js';

/** Captures what a promise rejects with, so it can be mapped and asserted on. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject');
}

describe('test harness (e2e)', () => {
  const db = testDb();

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('throwaway database', () => {
    it('is this run’s own database, not the dev database', async () => {
      const [{ name }] = await db.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
      expect(name).toMatch(/^cert_test_[a-z0-9]+_\d+_cert_syd$/);
      expect(name).toBe(`${inject('tenantDatabasePrefix')}cert_syd`);
      expect(process.env.TENANT_DATABASE_PREFIX).toBe(inject('tenantDatabasePrefix'));
    });

    it('has one throwaway database per tenant, each with its admin', async () => {
      for (const code of ['SYD', 'PER', 'ADL'] as const) {
        const [{ name }] = await testDb(code).$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
        expect(name).toBe(testDatabaseName(code));
        expect(await testDb(code).admin.count()).toBe(1);
      }
    });

    it('is fully migrated', async () => {
      const rows = await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
      expect(Number(rows[0].n)).toBeGreaterThan(0);
    });
  });

  describe('resetDatabase', () => {
    it('empties every table and recreates admin as id 1', async () => {
      await createCertificate();
      await resetDatabase();
      expect(await db.certificate.count()).toBe(0);
      expect(await db.enrollment.count()).toBe(0);
      expect(await db.course.count()).toBe(0);
      expect(await db.participant.count()).toBe(0);
      expect(await db.admin.findMany()).toEqual([TEST_ADMIN]);
    });

    it('clears the append-only audit table too', async () => {
      const cert = await createCertificate();
      await db.auditEvent.create({
        data: {
          action: 'certificate.issued',
          actorId: TEST_ADMIN.id,
          actorName: TEST_ADMIN.name,
          courseId: cert.courseId,
          courseTitle: cert.courseTitle,
          participantId: cert.participantId,
          participantName: cert.participantName,
          certificateId: cert.id,
          serial: cert.serial,
        },
      });
      await resetDatabase();
      expect(await db.auditEvent.count()).toBe(0);
    });

    it('restarts ids, so suites see the same ids every run', async () => {
      await createCourse();
      await resetDatabase();
      const course = await createCourse();
      expect(course.id).toBe(1);
    });
  });

  describe('factories', () => {
    it('create a certificate with its whole chain and copied names', async () => {
      const participant = await createParticipant({
        firstName: 'Ana',
        lastName: "O'Neil",
      });
      const course = await createCourse({ title: 'First Aid' });
      const enrollment = await createEnrollment({ participant, course });
      const cert = await createCertificate({ enrollment });

      expect(enrollment.status).toBe('completed');
      expect(enrollment.completedAt).toBeInstanceOf(Date);
      expect(cert).toMatchObject({
        enrollmentId: enrollment.id,
        participantId: participant.id,
        courseId: course.id,
        participantName: "Ana O'Neil",
        courseTitle: 'First Aid',
        status: 'valid',
        issuedById: TEST_ADMIN.id,
      });
      expect(cert.serial).toMatch(/^SYD-2099-\d{6}$/);
    });

    it('give each row unique defaults', async () => {
      const a = await createParticipant();
      const b = await createParticipant();
      expect(a.email).not.toBe(b.email);
    });

    it('create a revoked certificate', async () => {
      const cert = await createCertificate({ revoked: { reason: 'typo' } });
      expect(cert).toMatchObject({
        status: 'revoked',
        revokedById: TEST_ADMIN.id,
        revokeReason: 'typo',
      });
    });

    it('leave enrolled learners without a completion date', async () => {
      const enrollment = await createEnrollment({ status: 'enrolled' });
      expect(enrollment.completedAt).toBeNull();
    });
  });

  describe('schema rules (spec §3.2)', () => {
    it('duplicate course code → 409 naming code', async () => {
      await createCourse({ code: 'FA-101' });
      const error = await rejection(createCourse({ code: 'FA-101' }));
      expect(toErrorResponse(error)).toEqual({
        status: 409,
        body: {
          error: 'duplicate',
          message: 'This value is already in use',
          fields: { code: 'is already in use' },
        },
      });
    });

    it('duplicate email in another case → 409 naming email', async () => {
      await createParticipant({ email: 'ana@example.com' });
      const error = await rejection(
        createParticipant({ email: 'ANA@example.com' }),
      );
      expect(toErrorResponse(error).body.fields).toEqual({
        email: 'is already in use',
      });
    });

    it('a second certificate for one enrollment → 409 without fields', async () => {
      const enrollment = await createEnrollment();
      await createCertificate({ enrollment });
      const error = await rejection(createCertificate({ enrollment }));
      const { status, body } = toErrorResponse(error);
      expect(status).toBe(409);
      expect(body).not.toHaveProperty('fields');
    });

    it('a participant can enroll in a course only once', async () => {
      const enrollment = await createEnrollment();
      const error = await rejection(
        createEnrollment({
          participant: enrollment.participant,
          course: enrollment.course,
        }),
      );
      expect(toErrorResponse(error).status).toBe(409);
    });

    describe('audit_event is append-only', () => {
      let eventId: number;

      beforeEach(async () => {
        const cert = await createCertificate();
        const event = await db.auditEvent.create({
          data: {
            action: 'certificate.issued',
            actorId: TEST_ADMIN.id,
            actorName: TEST_ADMIN.name,
            courseId: cert.courseId,
            courseTitle: cert.courseTitle,
            participantId: cert.participantId,
            participantName: cert.participantName,
            certificateId: cert.id,
            serial: cert.serial,
          },
        });
        eventId = event.id;
      });

      it('rejects UPDATE', async () => {
        await expect(
          db.auditEvent.update({
            where: { id: eventId },
            data: { actorName: 'someone else' },
          }),
        ).rejects.toThrow(/append-only: UPDATE is not allowed/);
      });

      it('rejects DELETE and keeps the row', async () => {
        await expect(
          db.auditEvent.delete({ where: { id: eventId } }),
        ).rejects.toThrow(/append-only: DELETE is not allowed/);
        expect(await db.auditEvent.count()).toBe(1);
      });
    });

    it('text search ignores case and accents (nguyen → Nguyễn)', async () => {
      await createParticipant({ firstName: 'Bao', lastName: 'Nguyễn' });
      await createParticipant({ firstName: 'Ana', lastName: "O'Neil" });
      const found = await db.participant.findMany({
        where: { lastName: { contains: 'nguyen' } },
      });
      expect(found.map((p) => p.lastName)).toEqual(['Nguyễn']);
    });

    it('stores and reads instants as UTC', async () => {
      const issuedAt = new Date('2026-12-31T15:30:00.123Z');
      const cert = await createCertificate({ issuedAt });
      const [row] = await db.$queryRaw<{ issued_at: string }[]>`
        SELECT DATE_FORMAT(issued_at, '%Y-%m-%d %H:%i:%s.%f') AS issued_at
        FROM certificate WHERE id = ${cert.id}`;
      expect(row.issued_at).toBe('2026-12-31 15:30:00.123000');
      const back = await db.certificate.findUniqueOrThrow({
        where: { id: cert.id },
      });
      expect(back.issuedAt.toISOString()).toBe('2026-12-31T15:30:00.123Z');
    });
  });
});
