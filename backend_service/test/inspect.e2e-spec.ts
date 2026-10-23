import { PrismaClient } from '@prisma/client';
import { NotFoundError, runView } from '../src/tools/inspect/cli.js';
import {
  auditLog,
  certificateDetail,
  certificates,
  courseDetail,
  courses,
  participantDetail,
  participants,
  readOnlyClient,
  ReadOnlyError,
  summary,
  type InspectorDb,
} from '../src/tools/inspect/queries.js';
import {
  listSchemaDatabases,
  toTenants,
  type DiscoveredTenant,
} from '../src/tools/inspect/tenants.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { closeTestDb, resetToSydneySeed, testDb } from './support/db.js';

/** The harness database stands in for a Sydney tenant database. */
const TENANT: DiscoveredTenant = {
  code: 'SYD',
  name: 'Sydney',
  timeZone: 'Australia/Sydney',
  known: true,
  database: 'cert_test (harness)',
};

describe('tenant inspector (e2e)', () => {
  let db: InspectorDb;
  const { counts, certificates: seeded } = SYDNEY_SEED;

  beforeAll(async () => {
    await resetToSydneySeed();
    db = readOnlyClient(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db.$disconnect();
    await closeTestDb();
  });

  describe('discovery', () => {
    it('sees the harness database on the server but never treats it as a tenant', async () => {
      const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
      const server = new PrismaClient({
        datasourceUrl: process.env.DATABASE_URL!.replace(/\/[^/]+$/, '/information_schema'),
      });
      try {
        const databases = await listSchemaDatabases(server);
        expect(databases).toContain(name);
        expect(toTenants(databases).map((t) => t.database)).not.toContain(name);
        expect(toTenants(databases).every((t) => /^cert_[a-z]{3}$/.test(t.database))).toBe(true);
      } finally {
        await server.$disconnect();
      }
    });
  });

  describe('read-only client', () => {
    it('refuses model writes and raw execute, and leaves the data unchanged', async () => {
      await expect(
        db.course.create({ data: { code: 'NEW-1', title: 'Should not exist' } }),
      ).rejects.toThrow(ReadOnlyError);
      await expect(db.certificate.updateMany({ data: { status: 'revoked' } })).rejects.toThrow(
        ReadOnlyError,
      );
      await expect(db.auditEvent.deleteMany()).rejects.toThrow(ReadOnlyError);
      await expect(db.$executeRawUnsafe('DELETE FROM course')).rejects.toThrow(ReadOnlyError);
      expect(await testDb().course.count()).toBe(counts.courses);
      expect(await testDb().certificate.count({ where: { status: 'revoked' } })).toBe(
        counts.revokedCertificates,
      );
    });

    it('still allows reads', async () => {
      expect(await db.course.count()).toBe(counts.courses);
    });
  });

  describe('queries on the Sydney seed', () => {
    it('summary matches the seed manifest', async () => {
      const s = await summary(db);
      expect(s).toMatchObject({
        admins: counts.admins,
        courses: counts.courses,
        participants: counts.participants,
        enrollments: counts.enrollments,
        completedEnrollments: counts.completedEnrollments,
        validCertificates: counts.certificates - counts.revokedCertificates,
        revokedCertificates: counts.revokedCertificates,
        auditEvents: counts.auditEvents,
      });
      const eligible = Object.values(SYDNEY_SEED.eligibleByCourse).reduce((a, b) => a + b, 0);
      expect(s.eligible).toBe(eligible);
      expect(s.serialCounters).toEqual([{ year: 2026, lastValue: counts.certificates }]);
    });

    it('courses report eligible counts per course as the manifest does', async () => {
      const rows = await courses(db);
      expect(rows).toHaveLength(counts.courses);
      for (const row of rows) {
        expect(row.eligible).toBe(SYDNEY_SEED.eligibleByCourse[row.code]);
      }
    });

    it('course detail finds a course by code in any case, or by id', async () => {
      const [code, id] = Object.entries(SYDNEY_SEED.courseIds)[0];
      const byCode = await courseDetail(db, code.toLowerCase());
      expect(byCode?.course.id).toBe(id);
      expect((await courseDetail(db, String(id)))?.course.code).toBe(code);
      expect(await courseDetail(db, 'NOPE-999')).toBeNull();
    });

    it('participants page through everyone', async () => {
      const first = await participants(db, { page: 1, pageSize: 10 });
      const second = await participants(db, { page: 2, pageSize: 10 });
      expect(first.total).toBe(counts.participants);
      expect(first.items).toHaveLength(Math.min(10, counts.participants));
      const ids = [...first.items, ...second.items].map((p) => p.id);
      expect(new Set(ids).size).toBe(counts.participants);
    });

    it('participant detail finds by email in any case', async () => {
      const cert = await certificateDetail(db, seeded.revoked.serial);
      const p = await participantDetail(db, String(cert!.participantId));
      expect(p?.participant.name).toBe(seeded.revoked.participantName);
      const byEmail = await participantDetail(db, p!.participant.email.toUpperCase());
      expect(byEmail?.participant.id).toBe(p!.participant.id);
      expect(await participantDetail(db, 'nobody@example.com')).toBeNull();
    });

    it('certificates search by name (accent-insensitive) or serial prefix and filter by status', async () => {
      const all = await certificates(db);
      expect(all.total).toBe(counts.certificates);
      // Newest first.
      const times = all.items.map((c) => c.issuedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));

      const byName = await certificates(db, { q: 'nguyen' });
      expect(byName.items.map((c) => c.serial)).toContain(seeded.revoked.serial);

      const bySerial = await certificates(db, { q: seeded.newYear.serial });
      expect(bySerial.items.map((c) => c.serial)).toEqual([seeded.newYear.serial]);

      const revoked = await certificates(db, { status: 'revoked' });
      expect(revoked.total).toBe(counts.revokedCertificates);
    });

    it('certificate detail includes the revoke and its audit trail, oldest first', async () => {
      const d = await certificateDetail(db, seeded.revoked.serial.toLowerCase());
      expect(d).toMatchObject({
        serial: seeded.revoked.serial,
        status: 'revoked',
        revokeReason: seeded.revoked.revokeReason,
      });
      expect(d!.auditEvents.map((a) => a.action)).toEqual([
        'certificate.issued',
        'certificate.revoked',
      ]);
      expect(await certificateDetail(db, 'SYD-1999-000000')).toBeNull();
    });

    it('audit log is newest first and filters by action', async () => {
      const p = await auditLog(db, { pageSize: 100 });
      expect(p.total).toBe(counts.auditEvents);
      const times = p.items.map((a) => a.occurredAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const revoked = await auditLog(db, { action: 'certificate.revoked' });
      expect(revoked.total).toBe(counts.revokedCertificates);
    });
  });

  describe('runView', () => {
    const view = { kind: 'view' as const, tenant: 'SYD', json: false };

    it('prints the certificate with its issue time in Sydney time', async () => {
      const out = await runView(db, TENANT, {
        ...view,
        view: 'certificate',
        target: seeded.newYear.serial,
      });
      expect(out).toContain(seeded.newYear.serial);
      expect(out).toMatch(/Issued\s+2026-01-01 00:\d\d AEDT/);
    });

    it('prints JSON when asked', async () => {
      const out = await runView(db, TENANT, { ...view, view: 'certificates', json: true });
      expect(JSON.parse(out)).toMatchObject({ total: counts.certificates, page: 1 });
    });

    it('raises NotFoundError for a missing target', async () => {
      await expect(
        runView(db, TENANT, { ...view, view: 'certificate', target: 'SYD-1999-000000' }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
