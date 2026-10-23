import { auditEventListResponseSchema, TENANT_HEADER } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetToSydneySeed, TEST_ADMIN } from './support/db.js';
import { createTestApp } from './support/test-app.js';

const C = SYDNEY_SEED.certificates;
type Event = { id: number; action: string; serial: string; occurredAt: string; certificateId: number; courseId: number };

describe('Audit events (e2e)', () => {
  let app: INestApplication;
  const list = (query: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get('/api/audit-events').set(TENANT_HEADER, 'SYD').query(query);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  it('lists the seeded events newest first, in the contract shape', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const body = auditEventListResponseSchema.parse(res.body);
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: SYDNEY_SEED.counts.auditEvents, timezone: 'Australia/Sydney' });
    const times = body.items.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(body.items[0]).toMatchObject({ action: 'certificate.issued', serial: C.dstStartAfter.serial });
    expect(body.items.at(-1)).toMatchObject({ action: 'certificate.issued', serial: C.newYear.serial });
  });

  it('gives each event its copied who and what', async () => {
    const res = await list({ action: 'certificate.revoked' });
    expect(res.body.items).toEqual([
      {
        id: expect.any(Number),
        occurredAt: '2026-02-10T23:00:00.000Z',
        action: 'certificate.revoked',
        actor: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
        courseId: SYDNEY_SEED.courseIds['FA-101'],
        courseTitle: 'First Aid Essentials',
        participantId: 2,
        participantName: 'Bảo Nguyễn',
        certificateId: C.revoked.id,
        serial: C.revoked.serial,
        details: { reason: 'Name misspelt on certificate' },
      },
    ]);
  });

  it('filters by certificate: the revoked one has its revoke, then its issue', async () => {
    const res = await list({ certificateId: C.revoked.id });
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((e: Event) => e.action)).toEqual(['certificate.revoked', 'certificate.issued']);
    expect(res.body.items.every((e: Event) => e.certificateId === C.revoked.id)).toBe(true);
  });

  it('filters by course', async () => {
    const res = await list({ courseId: SYDNEY_SEED.courseIds['WHS-201'] });
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((e: Event) => e.serial)).toEqual([C.dstStartBefore.serial, C.dstEndAfter.serial]);
  });

  it('filters by action', async () => {
    expect((await list({ action: 'certificate.issued' })).body.total).toBe(6);
    expect((await list({ action: 'certificate.revoked' })).body.total).toBe(1);
  });

  it('combines filters', async () => {
    const res = await list({ courseId: SYDNEY_SEED.courseIds['FA-101'], action: 'certificate.issued' });
    expect(res.body.total).toBe(3);
    expect((await list({ certificateId: C.newYear.id, action: 'certificate.revoked' })).body).toMatchObject({ items: [], total: 0 });
  });

  it('pages: a full page, the last partial page, then an empty page', async () => {
    const all = (await list({ pageSize: 100 })).body.items.map((e: Event) => e.id);
    const p1 = (await list({ pageSize: 3, page: 1 })).body.items.map((e: Event) => e.id);
    const p3 = (await list({ pageSize: 3, page: 3 })).body;
    const p4 = (await list({ pageSize: 3, page: 4 })).body;
    expect(p1).toEqual(all.slice(0, 3));
    expect(p3.items.map((e: Event) => e.id)).toEqual(all.slice(6));
    expect(p4).toMatchObject({ items: [], total: 7, page: 4 });
  });

  it('shows a new revoke at the top', async () => {
    await request(app.getHttpServer())
      .post(`/api/certificates/${C.newYear.id}/revoke`)
      .send({ reason: 'Wrong person' });
    const [top] = (await list()).body.items;
    expect(top).toMatchObject({
      action: 'certificate.revoked',
      certificateId: C.newYear.id,
      details: { reason: 'Wrong person' },
    });
  });

  it.each([
    [{ action: 'certificate.deleted' }, 'action'],
    [{ certificateId: 'abc' }, 'certificateId'],
    [{ courseId: '0' }, 'courseId'],
    [{ pageSize: '101' }, 'pageSize'],
  ])('rejects %j with 400', async (query, field) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_failed', fields: { [field]: expect.any(String) } });
  });
});
