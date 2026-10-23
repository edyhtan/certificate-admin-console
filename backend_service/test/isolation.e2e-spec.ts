import { issuanceEventSchema, type IssuanceEvent } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EXPORT_BATCH_SIZE } from '../src/core/certificates/certificate-export.service.js';
import { CoursesService } from '../src/core/courses/courses.service.js';
import { NoTenantScopeError } from '../src/tenancy/tenant-app-context.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { execSql, resetDatabase, resetToSydneySeed, testDb } from './support/db.js';
import { createCertificate, createCourse, createEnrollment, createParticipant } from './support/factories.js';
import { api, createTestApp } from './support/test-app.js';

const per = () => testDb('PER');

/**
 * Perth gets 4 courses and 8 certificates, Sydney (seed) has 3 and 6: so course 4 and
 * certificates 7 and 8 exist only in Perth, and ids 1–3 / 1–6 exist in both with different rows.
 * Their serials use 2099, so Perth's real serial generator (counter empty) starts at 2026-000001.
 */
async function seedPerth() {
  await resetDatabase(per());
  const courses = [];
  for (let i = 1; i <= 4; i++) courses.push(await createCourse({ code: `PC-${i}`, title: `Perth course ${i}` }, per()));
  for (let i = 1; i <= 8; i++) {
    const participant = await createParticipant({ firstName: 'Perth', lastName: `Learner ${i}` }, per());
    const enrollment = await createEnrollment({ participant, course: courses[(i - 1) % 4] }, per());
    await createCertificate({ enrollment, serial: `PER-2099-${String(i).padStart(6, '0')}` }, per());
  }
  // Learners waiting in Perth's course 4, for bulk issue.
  for (let i = 1; i <= 4; i++) {
    const participant = await createParticipant({ firstName: 'Waiting', lastName: `Perth ${i}` }, per());
    await createEnrollment({ participant, course: courses[3] }, per());
  }
  return courses;
}

function streamText() {
  return (res: request.Response, done: (err: Error | null, body: string) => void) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (c: string) => (text += c));
    res.on('end', () => done(null, text));
  };
}

const events = (text: string): IssuanceEvent[] =>
  text.split('\n').filter(Boolean).map((l) => issuanceEventSchema.parse(JSON.parse(l)));

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let smallBatches: INestApplication;
  let perthCourses: { id: number }[];

  beforeAll(async () => {
    app = await createTestApp();
    smallBatches = await createTestApp({ configure: (b) => b.overrideProvider(EXPORT_BATCH_SIZE).useValue(2) });
  });

  afterAll(async () => {
    await resetDatabase(per());
    await app.close();
    await smallBatches.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
    perthCourses = await seedPerth();
  });

  describe('with tenant_id: SYD', () => {
    it('a Perth-only certificate id is 404; with PER it is found', async () => {
      const syd = await api(app, 'SYD').get('/api/certificates/7');
      expect(syd.status).toBe(404);
      expect(syd.body).toEqual({ error: 'not_found', message: 'Certificate not found' });
      const perth = await api(app, 'PER').get('/api/certificates/7');
      expect(perth.status).toBe(200);
      expect(perth.body.serial).toBe('PER-2099-000007');
    });

    it('an id both tenants have returns each tenant its own row', async () => {
      expect((await api(app, 'SYD').get('/api/certificates/1')).body.serial).toBe(SYDNEY_SEED.certificates.newYear.serial);
      expect((await api(app, 'PER').get('/api/certificates/1')).body.serial).toBe('PER-2099-000001');
    });

    it('revoking a Perth-only id is 404 and leaves Perth untouched', async () => {
      const res = await api(app, 'SYD').post('/api/certificates/8/revoke').send({ reason: 'cross-tenant' });
      expect(res.status).toBe(404);
      expect((await per().certificate.findUniqueOrThrow({ where: { id: 8 } })).status).toBe('valid');
      expect(await per().auditEvent.count()).toBe(0);
    });

    it('revoking id 1 changes only Sydney’s certificate 1', async () => {
      await api(app, 'SYD').post('/api/certificates/1/revoke').send({ reason: 'mine' });
      expect((await testDb('SYD').certificate.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('revoked');
      expect((await per().certificate.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('valid');
      expect(await per().auditEvent.count()).toBe(0);
    });

    it('the list has no Perth serials, even when searching for them', async () => {
      const all = await api(app, 'SYD').get('/api/certificates').query({ pageSize: 100 });
      expect(all.body.total).toBe(SYDNEY_SEED.counts.certificates);
      expect(all.body.items.some((c: { serial: string }) => c.serial.startsWith('PER-'))).toBe(false);
      expect((await api(app, 'SYD').get('/api/certificates').query({ q: 'PER-' })).body.total).toBe(0);
      expect((await api(app, 'SYD').get('/api/certificates').query({ q: 'Perth' })).body.total).toBe(0);
    });

    it('the export has no Perth serials', async () => {
      const csv = (await api(app, 'SYD').get('/api/certificates/export.csv').buffer(true).parse(streamText())).body as string;
      expect(csv).not.toContain('PER-');
      expect(csv.trim().split('\r\n')).toHaveLength(1 + SYDNEY_SEED.counts.certificates);
      expect((await api(app, 'PER').get('/api/certificates/export.csv')).text).not.toContain('SYD-');
    });

    it('bulk issue and its preview for a Perth-only course id are 404', async () => {
      const perthOnly = perthCourses[3].id;
      expect(perthOnly).toBe(4);
      expect((await api(app, 'SYD').get('/api/issuances/preview').query({ courseId: perthOnly })).status).toBe(404);
      const issue = await api(app, 'SYD').post('/api/issuances').send({ courseId: perthOnly });
      expect(issue.status).toBe(404);
      expect(issue.body).toEqual({ error: 'not_found', message: 'Course not found' });
      expect(await per().certificate.count()).toBe(8);
    });

    it('audit events and courses come from Sydney only', async () => {
      await createCourse({ code: 'SAME-CODE', title: 'Perth copy' }, per());
      const courses = await api(app, 'SYD').get('/api/courses');
      expect(courses.body.items.map((c: { code: string }) => c.code)).not.toContain('SAME-CODE');
      // The same code may exist in both tenants: unique keys are per tenant database.
      expect((await api(app, 'SYD').post('/api/courses').send({ code: 'SAME-CODE', title: 'Sydney copy' })).status).toBe(201);
      expect((await api(app, 'SYD').get('/api/audit-events')).body.total).toBe(SYDNEY_SEED.counts.auditEvents);
      expect((await api(app, 'PER').get('/api/audit-events')).body.total).toBe(0);
    });
  });

  describe('without a valid tenant', () => {
    const routes: [string, string][] = [
      ['get', '/api/certificates'],
      ['get', '/api/certificates/1'],
      ['post', '/api/certificates/1/revoke'],
      ['get', '/api/certificates/export.csv'],
      ['get', '/api/courses'],
      ['post', '/api/courses'],
      ['post', '/api/participants'],
      ['get', '/api/issuances/preview?courseId=1'],
      ['post', '/api/issuances'],
      ['get', '/api/audit-events'],
    ];

    it.each(routes)('%s %s with no header → 400', async (method, path) => {
      const res = await (request(app.getHttpServer()) as unknown as Record<string, (p: string) => request.Test>)[method](path);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown_tenant');
    });

    it.each(routes)('%s %s with XYZ → 400', async (method, path) => {
      const res = await (request(app.getHttpServer()) as unknown as Record<string, (p: string) => request.Test>)
        [method](path)
        .set('tenant_id', 'XYZ');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown_tenant');
    });
  });

  describe('ambient scope under concurrency', () => {
    beforeEach(() => {
      // Slow each certificate insert, so the two runs below really interleave.
      for (const code of ['SYD', 'PER'] as const) {
        execSql('CREATE TRIGGER test_slow BEFORE INSERT ON certificate FOR EACH ROW BEGIN DO SLEEP(0.05); END', code);
      }
    });

    afterEach(() => {
      for (const code of ['SYD', 'PER'] as const) execSql('DROP TRIGGER IF EXISTS test_slow;', code);
    });

    it('Sydney and Perth bulk issues at the same time each stream and write only their own serials', async () => {
      const issue = (code: 'SYD' | 'PER', courseId: number) =>
        api(app, code).post('/api/issuances').send({ courseId }).buffer(true).parse(streamText());
      const [syd, perth] = await Promise.all([
        issue('SYD', SYDNEY_SEED.courseIds['FA-101']),
        issue('PER', perthCourses[3].id),
      ]);

      const sydSerials = events(syd.body as string).flatMap((e) => (e.type === 'result' && e.outcome === 'issued' ? [e.serial] : []));
      const perSerials = events(perth.body as string).flatMap((e) => (e.type === 'result' && e.outcome === 'issued' ? [e.serial] : []));
      expect(sydSerials).toEqual(['SYD-2026-000007', 'SYD-2026-000008', 'SYD-2026-000009', 'SYD-2026-000010', 'SYD-2026-000011']);
      // Perth's counter starts from nothing: its own serial sequence.
      expect(perSerials).toEqual(['PER-2026-000001', 'PER-2026-000002', 'PER-2026-000003', 'PER-2026-000004']);

      const sydRows = await testDb('SYD').certificate.findMany({ where: { serial: { in: sydSerials } } });
      expect(sydRows).toHaveLength(5);
      expect(await per().certificate.count({ where: { serial: { startsWith: 'SYD-' } } })).toBe(0);
      expect(await testDb('SYD').auditEvent.count({ where: { serial: { startsWith: 'PER-' } } })).toBe(0);
      expect(await per().auditEvent.count({ where: { action: 'certificate.issued' } })).toBe(4);
    });

    it('exports in batches of 2 for both tenants at once keep their tenant to the last row', async () => {
      const exportOf = (code: 'SYD' | 'PER') =>
        api(smallBatches, code).get('/api/certificates/export.csv').buffer(true).parse(streamText());
      const [syd, perth] = await Promise.all([exportOf('SYD'), exportOf('PER')]);
      const sydRows = (syd.body as string).trim().split('\r\n').slice(1);
      const perRows = (perth.body as string).trim().split('\r\n').slice(1);
      expect(sydRows).toHaveLength(6);
      expect(perRows).toHaveLength(8);
      expect(sydRows.every((r) => r.includes(',SYD-'))).toBe(true);
      expect(perRows.every((r) => r.includes(',PER-'))).toBe(true);
    });

    it('many interleaved detail requests across tenants each answer from their own database', async () => {
      const codes = ['SYD', 'PER', 'ADL'] as const;
      const calls = Array.from({ length: 30 }, (_, i) => {
        const code = codes[i % 3];
        return api(app, code)
          .get('/api/certificates/1')
          .then((res) => ({ code, res }));
      });
      for (const { code, res } of await Promise.all(calls)) {
        if (code === 'ADL') expect(res.status).toBe(404); // Adelaide's test database has no certificates
        else expect(res.body.serial.startsWith(`${code}-`)).toBe(true);
      }
    });
  });

  it('a core service called outside any request or runInTenant throws', async () => {
    await expect(app.get(CoursesService).list()).rejects.toBeInstanceOf(NoTenantScopeError);
  });
});
