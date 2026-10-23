import { PrismaClient } from '@prisma/client';
import { inject } from 'vitest';
import { setUpTenants } from '../src/seed/db-setup.js';
import { ADELAIDE_SEED, PERTH_SEED, SYDNEY_SEED } from '../src/seed/manifest.js';
import { TENANT_CODES, tenantDatabaseName, tenantDatabaseUrl } from '../src/tenancy/tenants.js';

/** Databases of their own, so this test starts from nothing: `cert_test_<run>_setup_cert_syd` etc. */
const prefix = `${inject('tenantDatabasePrefix')}setup_`;
const base = inject('databaseUrlBase');
const server = new PrismaClient({ datasourceUrl: tenantDatabaseUrl(base, 'mysql', 1) });
const clientFor = (code: (typeof TENANT_CODES)[number]) =>
  new PrismaClient({ datasourceUrl: tenantDatabaseUrl(base, tenantDatabaseName(code, prefix)) });

async function fingerprint(db: PrismaClient) {
  return {
    admins: await db.admin.findMany({ orderBy: { id: 'asc' } }),
    courses: await db.course.findMany({ orderBy: { id: 'asc' } }),
    participants: await db.participant.count(),
    enrollments: await db.enrollment.count(),
    certificates: await db.certificate.findMany({ orderBy: { id: 'asc' }, select: { id: true, serial: true, issuedAt: true } }),
    auditEvents: await db.auditEvent.count(),
    counters: await db.serialCounter.findMany({ orderBy: { year: 'asc' } }),
  };
}

describe('db:setup for every tenant (e2e)', () => {
  const clients = Object.fromEntries(TENANT_CODES.map((c) => [c, clientFor(c)])) as Record<
    (typeof TENANT_CODES)[number],
    PrismaClient
  >;

  afterAll(async () => {
    await Promise.all(Object.values(clients).map((c) => c.$disconnect()));
    for (const code of TENANT_CODES) {
      await server.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${tenantDatabaseName(code, prefix)}\``);
    }
    await server.$disconnect();
  });

  it('creates, migrates and seeds one database per tenant from nothing', async () => {
    const results = await setUpTenants({ base, prefix });
    expect(results).toEqual(
      TENANT_CODES.map((code) => ({ code, database: tenantDatabaseName(code, prefix), outcome: 'seeded' })),
    );

    const schemas = await server.$queryRaw<{ name: string; collation: string }[]>`
      SELECT schema_name AS name, default_collation_name AS collation
      FROM information_schema.schemata WHERE schema_name LIKE ${`${prefix}%`} ORDER BY schema_name`;
    expect(schemas).toHaveLength(3);
    for (const s of schemas) expect(s.collation).toBe('utf8mb4_0900_ai_ci');
  });

  it('seeds Sydney with its small set', async () => {
    const f = await fingerprint(clients.SYD);
    expect(f.participants).toBe(SYDNEY_SEED.counts.participants);
    expect(f.certificates.map((c) => c.serial)[0]).toBe('SYD-2026-000001');
    expect(f.auditEvents).toBe(SYDNEY_SEED.counts.auditEvents);
    expect(f.counters).toEqual([{ year: 2026, lastValue: 6 }]);
  });

  it('seeds Perth with only its admin and courses', async () => {
    const f = await fingerprint(clients.PER);
    expect(f.admins).toHaveLength(1);
    expect(f.courses.map((c) => c.code)).toEqual(Object.keys(PERTH_SEED.courseIds));
    expect([f.participants, f.enrollments, f.certificates.length, f.auditEvents]).toEqual([0, 0, 0, 0]);
    expect(f.counters).toEqual([]);
  });

  it('seeds Adelaide with its large set', async () => {
    const f = await fingerprint(clients.ADL);
    expect(f.participants).toBe(250);
    expect(f.enrollments).toBe(ADELAIDE_SEED.counts.enrollments);
    expect(f.certificates).toHaveLength(150);
    expect(f.auditEvents).toBe(151);
    expect(f.counters).toEqual([{ year: 2026, lastValue: 150 }]);
    const dst = f.certificates.find((c) => c.serial === ADELAIDE_SEED.certificates.dstEndAfter.serial);
    expect(dst?.issuedAt.toISOString()).toBe('2026-04-04T18:00:00.000Z');
  });

  it('changes nothing when run again', async () => {
    const before = await Promise.all(TENANT_CODES.map((c) => fingerprint(clients[c])));
    const results = await setUpTenants({ base, prefix });
    expect(results.map((r) => r.outcome)).toEqual(['already seeded', 'already seeded', 'already seeded']);
    expect(await Promise.all(TENANT_CODES.map((c) => fingerprint(clients[c])))).toEqual(before);
  });

  it('sets up only the tenants asked for', async () => {
    const results = await setUpTenants({ base, prefix, codes: ['PER'] });
    expect(results).toEqual([{ code: 'PER', database: tenantDatabaseName('PER', prefix), outcome: 'already seeded' }]);
  });
});
