import { setUpDatabase } from '../src/seed/db-setup.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { SYDNEY } from '../src/seed/profiles/sydney.js';
import { resetDatabase, resetToSydneySeed, TEST_ADMIN, testDb } from './support/db.js';

/** A fingerprint of every seeded table, to compare two states. */
async function snapshot() {
  const db = testDb();
  return {
    admins: await db.admin.findMany({ orderBy: { id: 'asc' } }),
    courses: await db.course.findMany({ orderBy: { id: 'asc' } }),
    participants: await db.participant.findMany({ orderBy: { id: 'asc' } }),
    enrollments: await db.enrollment.findMany({ orderBy: { id: 'asc' } }),
    certificates: await db.certificate.findMany({ orderBy: { id: 'asc' } }),
    auditEvents: await db.auditEvent.findMany({ orderBy: { id: 'asc' } }),
    serialCounters: await db.serialCounter.findMany(),
  };
}

describe('Sydney seed (e2e)', () => {
  const db = testDb();

  describe('resetToSydneySeed', () => {
    beforeAll(async () => {
      await resetToSydneySeed();
    });

    it('creates the rows SYDNEY_SEED describes', async () => {
      const { counts } = SYDNEY_SEED;
      expect(await db.admin.count()).toBe(counts.admins);
      expect(await db.course.count()).toBe(counts.courses);
      expect(await db.participant.count()).toBe(counts.participants);
      expect(await db.enrollment.count()).toBe(counts.enrollments);
      expect(await db.enrollment.count({ where: { status: 'completed' } })).toBe(
        counts.completedEnrollments,
      );
      expect(await db.certificate.count()).toBe(counts.certificates);
      expect(await db.certificate.count({ where: { status: 'revoked' } })).toBe(
        counts.revokedCertificates,
      );
      expect(await db.auditEvent.count()).toBe(counts.auditEvents);
    });

    it('gives the admin the id and name the app acts as', async () => {
      expect(await db.admin.findMany()).toEqual([TEST_ADMIN]);
    });

    it('uses the course ids from the manifest', async () => {
      const courses = await db.course.findMany();
      expect(Object.fromEntries(courses.map((c) => [c.code, c.id]))).toEqual(
        SYDNEY_SEED.courseIds,
      );
    });

    it('stores the three edge cases at the expected UTC instants', async () => {
      for (const key of ['newYear', 'dstEndBefore', 'dstEndAfter', 'dstStartBefore', 'dstStartAfter']) {
        const expected = SYDNEY_SEED.certificates[key];
        const row = await db.certificate.findUniqueOrThrow({ where: { id: expected.id } });
        expect(row.serial, key).toBe(expected.serial);
        expect(row.issuedAt.toISOString(), key).toBe(expected.issuedAt);
      }
      // Hard-coded too, in case the manifest and the seed went wrong the same way.
      const newYear = await db.certificate.findUniqueOrThrow({
        where: { serial: 'SYD-2026-000001' },
      });
      expect(newYear.issuedAt.toISOString()).toBe('2025-12-31T13:30:00.000Z');
    });

    it('stores the revoked certificate with when, who and why', async () => {
      const expected = SYDNEY_SEED.certificates.revoked;
      const row = await db.certificate.findUniqueOrThrow({ where: { id: expected.id } });
      expect(row).toMatchObject({
        status: 'revoked',
        participantName: 'Bảo Nguyễn',
        revokedById: TEST_ADMIN.id,
        revokeReason: expected.revokeReason,
      });
      expect(row.revokedAt?.toISOString()).toBe(expected.revokedAt);
    });

    it('writes one issued event per certificate and one revoked event, in time order', async () => {
      const events = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
      const times = events.map((e) => e.occurredAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(events.filter((e) => e.action === 'certificate.issued')).toHaveLength(6);
      const revoked = events.filter((e) => e.action === 'certificate.revoked');
      expect(revoked).toHaveLength(1);
      expect(revoked[0]).toMatchObject({
        actorId: TEST_ADMIN.id,
        actorName: TEST_ADMIN.name,
        serial: 'SYD-2026-000002',
        participantName: 'Bảo Nguyễn',
        courseTitle: 'First Aid Essentials',
        details: { reason: 'Name misspelt on certificate' },
      });
    });

    it('leaves the 2026 serial counter at the last seeded sequence', async () => {
      expect(await db.serialCounter.findMany()).toEqual([{ year: 2026, lastValue: 6 }]);
    });

    it('leaves learners eligible for bulk issue in every course', async () => {
      for (const [code, eligible] of Object.entries(SYDNEY_SEED.eligibleByCourse)) {
        const count = await db.enrollment.count({
          where: { course: { code }, status: 'completed', certificate: null },
        });
        expect(count, code).toBe(eligible);
      }
    });

    it('can be found with an accent-free search (nguyen → Nguyễn)', async () => {
      const found = await db.certificate.findMany({
        where: { participantName: { contains: 'nguyen' } },
      });
      expect(found.map((c) => c.serial)).toEqual(['SYD-2026-000002']);
    });

    it('gives the same ids and rows on every reset', async () => {
      const first = await snapshot();
      await resetToSydneySeed();
      expect(await snapshot()).toEqual(first);
    });
  });

  describe('db:setup seeding step', () => {
    beforeEach(async () => {
      await resetDatabase();
      await db.admin.deleteMany();
    });

    afterAll(async () => {
      await resetDatabase();
    });

    it('seeds an empty database, then leaves it alone', async () => {
      await expect(setUpDatabase(db, SYDNEY)).resolves.toBe('seeded');
      const once = await snapshot();
      await expect(setUpDatabase(db, SYDNEY)).resolves.toBe('already seeded');
      expect(await snapshot()).toEqual(once);
      expect(once.certificates).toHaveLength(SYDNEY_SEED.counts.certificates);
    });

    it('leaves nothing behind when a seed fails part-way', async () => {
      const broken = {
        ...SYDNEY,
        certificates: [{ ...SYDNEY.certificates[0], course: 'NOPE' }],
      };
      await expect(setUpDatabase(db, broken)).rejects.toThrow('seed: unknown');
      expect(await db.admin.count()).toBe(0);
      expect(await db.course.count()).toBe(0);
      expect(await db.enrollment.count()).toBe(0);
    });
  });
});
