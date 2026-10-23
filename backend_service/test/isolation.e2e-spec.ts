import { issuanceEventSchema, type IssuanceEvent } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
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

const issuedSerials = (text: string) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((l): IssuanceEvent => issuanceEventSchema.parse(JSON.parse(l)))
    .flatMap((e) => (e.type === 'result' && e.outcome === 'issued' ? [e.serial] : []));

/**
 * One cross-tenant check per endpoint, with tenant_id SYD against Perth's data. The data is set up
 * once; checks that write leave everything the later checks read as it was.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let perthOnlyCourseId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await resetToSydneySeed();
    perthOnlyCourseId = (await seedPerth())[3].id;
  });

  afterAll(async () => {
    await resetDatabase(per());
    await app.close();
  });

  it('detail: a Perth-only id is 404 for SYD; a shared id gives each tenant its own row', async () => {
    expect((await api(app, 'SYD').get('/api/certificates/7')).status).toBe(404);
    expect((await api(app, 'PER').get('/api/certificates/7')).body.serial).toBe('PER-2099-000007');
    expect((await api(app, 'SYD').get('/api/certificates/1')).body.serial).toBe(SYDNEY_SEED.certificates.newYear.serial);
    expect((await api(app, 'PER').get('/api/certificates/1')).body.serial).toBe('PER-2099-000001');
  });

  it('revoke: a Perth-only id is 404 for SYD and Perth is untouched', async () => {
    expect((await api(app, 'SYD').post('/api/certificates/8/revoke').send({})).status).toBe(404);
    expect((await per().certificate.findUniqueOrThrow({ where: { id: 8 } })).status).toBe('valid');
    expect(await per().auditEvent.count()).toBe(0);
  });

  it('list and search: no Perth serials for SYD', async () => {
    const all = await api(app, 'SYD').get('/api/certificates').query({ pageSize: 100 });
    expect(all.body.total).toBe(SYDNEY_SEED.counts.certificates);
    expect(all.body.items.some((c: { serial: string }) => c.serial.startsWith('PER-'))).toBe(false);
    expect((await api(app, 'SYD').get('/api/certificates').query({ q: 'PER-' })).body.total).toBe(0);
  });

  it('export: no Perth serials for SYD', async () => {
    const csv = (await api(app, 'SYD').get('/api/certificates/export.csv').buffer(true).parse(streamText())).body as string;
    expect(csv).not.toContain('PER-');
    expect(csv.trim().split('\r\n')).toHaveLength(1 + SYDNEY_SEED.counts.certificates);
  });

  it('bulk issue and preview: a Perth-only course is 404 for SYD', async () => {
    expect((await api(app, 'SYD').get('/api/issuances/preview').query({ courseId: perthOnlyCourseId })).status).toBe(404);
    expect((await api(app, 'SYD').post('/api/issuances').send({ courseId: perthOnlyCourseId })).status).toBe(404);
  });

  it('courses and audit events: per tenant, and the same course code may exist in both', async () => {
    await createCourse({ code: 'SAME-CODE', title: 'Perth copy' }, per());
    expect((await api(app, 'SYD').get('/api/courses')).body.items.map((c: { code: string }) => c.code)).not.toContain('SAME-CODE');
    expect((await api(app, 'SYD').post('/api/courses').send({ code: 'SAME-CODE', title: 'Sydney copy' })).status).toBe(201);
    await testDb('SYD').course.deleteMany({ where: { code: 'SAME-CODE' } });
    expect((await api(app, 'PER').get('/api/audit-events')).body.total).toBe(0);
  });

  describe('the ambient scope under concurrency', () => {
    beforeAll(() => {
      // Slow each certificate insert, so the two runs really interleave.
      for (const code of ['SYD', 'PER'] as const) {
        execSql('CREATE TRIGGER test_slow BEFORE INSERT ON certificate FOR EACH ROW BEGIN DO SLEEP(0.05); END', code);
      }
    });

    afterAll(() => {
      for (const code of ['SYD', 'PER'] as const) execSql('DROP TRIGGER IF EXISTS test_slow;', code);
    });

    it('Sydney and Perth bulk issues at the same time each write and stream only their own serials', async () => {
      const issue = (code: 'SYD' | 'PER', courseId: number) =>
        api(app, code).post('/api/issuances').send({ courseId }).buffer(true).parse(streamText());
      const [syd, perth] = await Promise.all([
        issue('SYD', SYDNEY_SEED.courseIds['FA-101']),
        issue('PER', perthOnlyCourseId),
      ]);
      expect(issuedSerials(syd.body as string)).toEqual([
        'SYD-2026-000007', 'SYD-2026-000008', 'SYD-2026-000009', 'SYD-2026-000010', 'SYD-2026-000011',
      ]);
      // Perth's own counter, starting from nothing.
      expect(issuedSerials(perth.body as string)).toEqual([
        'PER-2026-000001', 'PER-2026-000002', 'PER-2026-000003', 'PER-2026-000004',
      ]);
      expect(await per().certificate.count({ where: { serial: { startsWith: 'SYD-' } } })).toBe(0);
      expect(await testDb('SYD').auditEvent.count({ where: { serial: { startsWith: 'PER-' } } })).toBe(0);
    });
  });
});
