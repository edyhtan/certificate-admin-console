import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  issuanceEventSchema,
  issuancePreviewResponseSchema,
  TENANT_HEADER,
  type IssuanceEvent,
} from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { execSql, resetToSydneySeed, TEST_ADMIN, testDb } from './support/db.js';
import { createTestApp } from './support/test-app.js';

const FA = SYDNEY_SEED.courseIds['FA-101'];
const WHS = SYDNEY_SEED.courseIds['WHS-201'];

/** Parses an NDJSON body, checking every line against the contract. */
function events(text: string): IssuanceEvent[] {
  return text
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => issuanceEventSchema.parse(JSON.parse(l)));
}

const results = (evs: IssuanceEvent[]) =>
  evs.filter((e): e is Extract<IssuanceEvent, { type: 'result' }> => e.type === 'result');

describe('Bulk issue (e2e)', () => {
  const db = testDb();
  let app: INestApplication;

  const issue = (courseId: unknown) =>
    request(app.getHttpServer())
      .post('/api/issuances')
      .set(TENANT_HEADER, 'SYD')
      .send({ courseId })
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done(null, text));
      });

  const preview = (courseId: unknown) =>
    request(app.getHttpServer())
      .get('/api/issuances/preview')
      .set(TENANT_HEADER, 'SYD')
      .query({ courseId });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  describe('GET /api/issuances/preview', () => {
    it('counts completed, already issued and eligible learners', async () => {
      const res = await preview(FA);
      expect(res.status).toBe(200);
      expect(issuancePreviewResponseSchema.parse(res.body)).toEqual({
        courseId: FA,
        completed: 8,
        alreadyIssued: 3,
        eligible: SYDNEY_SEED.eligibleByCourse['FA-101'],
      });
    });

    it('answers 404 for an unknown course and 400 for a bad id', async () => {
      expect((await preview(999)).status).toBe(404);
      expect((await preview(999)).body).toEqual({ error: 'not_found', message: 'Course not found' });
      expect((await preview('abc')).status).toBe(400);
      expect((await preview('')).status).toBe(400);
    });
  });

  describe('POST /api/issuances', () => {
    it('first run issues every eligible learner, streaming start, results and done', async () => {
      const res = await issue(FA);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/x-ndjson/);
      const evs = events(res.body);

      expect(evs[0]).toEqual({ type: 'start', total: 8 });
      expect(evs.at(-1)).toEqual({ type: 'done', issued: 5, skipped: 3, failed: 0 });

      const skipped = results(evs).filter((r) => r.outcome === 'skipped');
      const issued = results(evs).filter((r) => r.outcome === 'issued');
      expect(skipped.map((r) => [r.participantName, 'reason' in r && r.reason])).toEqual([
        ["Ana O'Neil", 'already_issued'],
        ['Bảo Nguyễn', 'revoked'],
        ['Chloé Dubois', 'already_issued'],
      ]);
      // Serials carry on from the seeded counter (6), in candidate order.
      expect(issued.map((r) => 'serial' in r && r.serial)).toEqual([
        'SYD-2026-000007',
        'SYD-2026-000008',
        'SYD-2026-000009',
        'SYD-2026-000010',
        'SYD-2026-000011',
      ]);
    });

    it('writes each certificate with copied names and one issued audit event each', async () => {
      const before = await db.auditEvent.count();
      await issue(FA);
      const created = await db.certificate.findMany({
        where: { serial: { gte: 'SYD-2026-000007' } },
        orderBy: { serial: 'asc' },
      });
      expect(created).toHaveLength(5);
      for (const c of created) {
        expect(c).toMatchObject({ courseTitle: 'First Aid Essentials', status: 'valid', issuedById: TEST_ADMIN.id });
        const ev = await db.auditEvent.findMany({ where: { certificateId: c.id } });
        expect(ev).toEqual([
          expect.objectContaining({
            action: 'certificate.issued',
            actorId: TEST_ADMIN.id,
            actorName: TEST_ADMIN.name,
            serial: c.serial,
            participantName: c.participantName,
            courseTitle: 'First Aid Essentials',
          }),
        ]);
      }
      expect(created.map((c) => c.participantName)).toEqual([
        "Liam O'Connor",
        'Zoë Müller',
        'Mateo García',
        'Aroha Ngata',
        'Priya Sharma',
      ]);
      expect(await db.auditEvent.count()).toBe(before + 5);
      expect((await preview(FA)).body.eligible).toBe(0);
    });

    it('second run issues 0, skips all, and writes no audit events', async () => {
      await issue(FA);
      const auditBefore = await db.auditEvent.count();
      const certsBefore = await db.certificate.count();
      const counter = await db.serialCounter.findUnique({ where: { year: 2026 } });

      const evs = events((await issue(FA)).body);
      expect(evs.at(-1)).toEqual({ type: 'done', issued: 0, skipped: 8, failed: 0 });
      expect(await db.auditEvent.count()).toBe(auditBefore);
      expect(await db.certificate.count()).toBe(certsBefore);
      expect(await db.serialCounter.findUnique({ where: { year: 2026 } })).toEqual(counter);
    });

    it('two runs at the same time issue each learner once', async () => {
      const auditBefore = await db.auditEvent.count();
      const [a, b] = await Promise.all([issue(WHS), issue(WHS)]);
      const doneA = events(a.body).at(-1)!;
      const doneB = events(b.body).at(-1)!;
      expect(doneA.type === 'done' && doneB.type === 'done').toBe(true);
      if (doneA.type !== 'done' || doneB.type !== 'done') return;
      expect(doneA.issued + doneB.issued).toBe(SYDNEY_SEED.eligibleByCourse['WHS-201']);
      expect(doneA.failed + doneB.failed).toBe(0);

      const whs = await db.certificate.findMany({ where: { courseId: WHS } });
      expect(whs).toHaveLength(2 + 5);
      expect(new Set(whs.map((c) => c.enrollmentId)).size).toBe(whs.length);
      expect(new Set(whs.map((c) => c.serial)).size).toBe(whs.length);
      expect(await db.auditEvent.count()).toBe(auditBefore + 5);
    });

    describe('when one learner fails', () => {
      beforeEach(async () => {
        execSql(`
          CREATE TRIGGER test_fail_aroha BEFORE INSERT ON certificate FOR EACH ROW
          BEGIN
            IF NEW.participant_name = 'Aroha Ngata' THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced failure';
            END IF;
          END`);
      });

      afterEach(async () => {
        execSql('DROP TRIGGER IF EXISTS test_fail_aroha;');
      });

      it('reports it failed, leaves no row for it, and issues the rest', async () => {
        const evs = events((await issue(FA)).body);
        const failed = results(evs).filter((r) => r.outcome === 'failed');
        expect(failed).toEqual([
          { type: 'result', enrollmentId: expect.any(Number), participantName: 'Aroha Ngata', outcome: 'failed', message: expect.any(String) },
        ]);
        expect(failed[0].outcome === 'failed' && failed[0].message).not.toMatch(/forced failure|SQL|certificate/i);
        expect(evs.at(-1)).toEqual({ type: 'done', issued: 4, skipped: 3, failed: 1 });

        const aroha = await db.certificate.findFirst({ where: { participantName: 'Aroha Ngata' } });
        expect(aroha).toBeNull();
        // The failed issue gave its serial back, so the four issued ones are 7–10 with no gap.
        const issued = results(evs).filter((r) => r.outcome === 'issued').map((r) => 'serial' in r && r.serial);
        expect(issued).toEqual(['SYD-2026-000007', 'SYD-2026-000008', 'SYD-2026-000009', 'SYD-2026-000010']);
        expect(await db.auditEvent.count({ where: { participantName: 'Aroha Ngata' } })).toBe(0);
      });

      it('a later run issues the learner that failed', async () => {
        await issue(FA);
        execSql('DROP TRIGGER IF EXISTS test_fail_aroha;');
        const evs = events((await issue(FA)).body);
        expect(evs.at(-1)).toEqual({ type: 'done', issued: 1, skipped: 7, failed: 0 });
        expect(results(evs).find((r) => r.outcome === 'issued')).toMatchObject({
          participantName: 'Aroha Ngata',
          serial: 'SYD-2026-000011',
        });
      });
    });

    it('answers 404 before streaming for an unknown course', async () => {
      const res = await request(app.getHttpServer()).post('/api/issuances').send({ courseId: 999 });
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body).toEqual({ error: 'not_found', message: 'Course not found' });
    });

    it.each([{}, { courseId: 'x' }, { courseId: 0 }])('answers 400 for body %j', async (body) => {
      const res = await request(app.getHttpServer()).post('/api/issuances').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_failed', fields: { courseId: expect.any(String) } });
    });

    it('streams a course with no completed learners as start 0 and done 0', async () => {
      const course = await db.course.create({ data: { code: 'EMPTY-1', title: 'Empty' } });
      expect(events((await issue(course.id)).body)).toEqual([
        { type: 'start', total: 0 },
        { type: 'done', issued: 0, skipped: 0, failed: 0 },
      ]);
    });

    describe('when the client disconnects', () => {
      beforeEach(async () => {
        // Slow each insert down so the run is still going when the client leaves.
        execSql(`
          CREATE TRIGGER test_slow_insert BEFORE INSERT ON certificate FOR EACH ROW
          BEGIN DO SLEEP(0.25); END`);
      });

      afterEach(async () => {
        execSql('DROP TRIGGER IF EXISTS test_slow_insert;');
      });

      it('finishes the run anyway', async () => {
        const server = app.getHttpServer() as http.Server;
        if (!server.listening) await new Promise<void>((r) => server.listen(0, r));
        const { port } = server.address() as AddressInfo;

        await new Promise<void>((resolve, reject) => {
          const req = http.request(
            { port, method: 'POST', path: '/api/issuances', headers: { 'Content-Type': 'application/json' } },
            (res) => {
              res.once('data', () => {
                req.destroy(); // leave after the first line
                resolve();
              });
            },
          );
          req.on('error', () => undefined);
          req.on('timeout', reject);
          req.end(JSON.stringify({ courseId: FA }));
        });

        const deadline = Date.now() + 10_000;
        let count = 0;
        while (Date.now() < deadline) {
          count = await db.certificate.count({ where: { courseId: FA } });
          if (count === 3 + 5) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(count).toBe(8);
        expect(await db.auditEvent.count({ where: { courseId: FA, action: 'certificate.issued' } })).toBe(3 + 5);
      });
    });
  });
});
