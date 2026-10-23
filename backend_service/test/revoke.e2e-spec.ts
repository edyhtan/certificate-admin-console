import { certificateDetailSchema, TENANT_HEADER } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { testAppContext } from './support/app-context.js';
import { resetToSydneySeed, TEST_ADMIN, testDb } from './support/db.js';
import { api, createTestApp } from './support/test-app.js';

const C = SYDNEY_SEED.certificates;

describe('Revoke (e2e)', () => {
  const db = testDb();
  let app: INestApplication;
  const revoke = (id: number | string, body?: unknown) => {
    const req = api(app)
      .post(`/api/certificates/${id}/revoke`)
      .set(TENANT_HEADER, 'SYD');
    return body === undefined ? req : req.send(body as object);
  };
  const revokedEvents = (certificateId: number) =>
    db.auditEvent.findMany({
      where: { certificateId, action: 'certificate.revoked' },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  it('revokes a valid certificate and answers with its new state', async () => {
    const before = Date.now();
    const res = await revoke(C.newYear.id, { reason: '  Issued to the wrong course ' });
    expect(res.status).toBe(200);
    const body = certificateDetailSchema.parse(res.body);
    expect(body).toMatchObject({
      id: C.newYear.id,
      status: 'revoked',
      revokedBy: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
      revokeReason: 'Issued to the wrong course',
      issuedAt: C.newYear.issuedAt,
    });
    const revokedAt = new Date(body.revokedAt!).getTime();
    expect(revokedAt).toBeGreaterThanOrEqual(before - 5);
    expect(revokedAt).toBeLessThanOrEqual(Date.now() + 5);

    const row = await db.certificate.findUniqueOrThrow({ where: { id: C.newYear.id } });
    expect(row).toMatchObject({ status: 'revoked', revokedById: TEST_ADMIN.id });
  });

  it('writes one certificate.revoked event with actor, course, participant and serial', async () => {
    await revoke(C.newYear.id, { reason: 'Issued to the wrong course' });
    const events = await revokedEvents(C.newYear.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'certificate.revoked',
      actorId: TEST_ADMIN.id,
      actorName: TEST_ADMIN.name,
      courseId: SYDNEY_SEED.courseIds['FA-101'],
      courseTitle: 'First Aid Essentials',
      participantId: 1,
      participantName: "Ana O'Neil",
      certificateId: C.newYear.id,
      serial: 'SYD-2026-000001',
      details: { reason: 'Issued to the wrong course' },
    });
  });

  it('revoking twice writes one event and keeps the first revoke', async () => {
    const first = await revoke(C.newYear.id, { reason: 'First' });
    const second = await revoke(C.newYear.id, { reason: 'Second' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      status: 'revoked',
      revokeReason: 'First',
      revokedAt: first.body.revokedAt,
    });
    expect(await revokedEvents(C.newYear.id)).toHaveLength(1);
    expect(await db.auditEvent.count()).toBe(SYDNEY_SEED.counts.auditEvents + 1);
  });

  it('answers 200 for the seeded revoked certificate and writes nothing', async () => {
    const res = await revoke(C.revoked.id, { reason: 'Again' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'revoked',
      revokedAt: C.revoked.revokedAt,
      revokeReason: C.revoked.revokeReason,
    });
    expect(await db.auditEvent.count()).toBe(SYDNEY_SEED.counts.auditEvents);
  });

  it('accepts a missing body and a blank reason, storing no reason', async () => {
    const noBody = await revoke(C.dstEndBefore.id);
    const blank = await revoke(C.dstEndAfter.id, { reason: '   ' });
    expect(noBody.status).toBe(200);
    expect(blank.status).toBe(200);
    expect(noBody.body.revokeReason).toBeNull();
    expect(blank.body.revokeReason).toBeNull();
    const [event] = await revokedEvents(C.dstEndBefore.id);
    expect(event.details).toBeNull();
  });

  it('five revokes at the same time change the row once and write one event', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => revoke(C.dstStartBefore.id, { reason: `try ${n}` })),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const events = await revokedEvents(C.dstStartBefore.id);
    expect(events).toHaveLength(1);
    const row = await db.certificate.findUniqueOrThrow({ where: { id: C.dstStartBefore.id } });
    // Every answer shows the one revoke that won.
    for (const r of results) expect(r.body.revokeReason).toBe(row.revokeReason);
    expect(events[0].details).toEqual({ reason: row.revokeReason });
  });

  it('answers 404 for an unknown id and writes nothing', async () => {
    const res = await revoke(999, { reason: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Certificate not found' });
    expect(await db.auditEvent.count()).toBe(SYDNEY_SEED.counts.auditEvents);
  });

  it('answers 400 for a bad id or a reason over 500 characters', async () => {
    const badId = await revoke('abc', {});
    expect(badId.status).toBe(400);
    expect(badId.body.fields).toHaveProperty('id');

    const long = await revoke(C.newYear.id, { reason: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({
      error: 'validation_failed',
      fields: { reason: 'must be 500 characters or less' },
    });
    const row = await db.certificate.findUniqueOrThrow({ where: { id: C.newYear.id } });
    expect(row.status).toBe('valid');
  });

  describe('with a fixed clock', () => {
    let fixedApp: INestApplication;
    const at = new Date('2026-10-22T03:15:00.000Z');

    beforeAll(async () => {
      fixedApp = await createTestApp({ context: testAppContext({ now: () => at }) });
    });

    afterAll(async () => {
      await fixedApp.close();
    });

    it('stamps the certificate and the event with AppContext.now()', async () => {
      const res = await api(fixedApp)
        .post(`/api/certificates/${C.newYear.id}/revoke`)
        .send({});
      expect(res.body.revokedAt).toBe('2026-10-22T03:15:00.000Z');
      const [event] = await revokedEvents(C.newYear.id);
      expect(event.occurredAt.toISOString()).toBe('2026-10-22T03:15:00.000Z');
    });
  });
});
