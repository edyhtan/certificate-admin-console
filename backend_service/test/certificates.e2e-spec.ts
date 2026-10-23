import {
  apiErrorBodySchema,
  certificateDetailSchema,
  certificateListResponseSchema,
  TENANT_HEADER,
} from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetToSydneySeed, TEST_ADMIN } from './support/db.js';
import { createCertificate } from './support/factories.js';
import { api as tenantApi, createTestApp } from './support/test-app.js';

const C = SYDNEY_SEED.certificates;
/** Seeded certificates, newest first. */
const NEWEST_FIRST = [
  C.dstStartAfter,
  C.dstStartBefore,
  C.dstEndAfter,
  C.dstEndBefore,
  C.revoked,
  C.newYear,
].map((c) => c.serial);

describe('Certificates list and detail (e2e)', () => {
  let app: INestApplication;
  const api = () => tenantApi(app);
  const list = (query: Record<string, string | number> = {}) =>
    api().get('/api/certificates').set(TENANT_HEADER, 'SYD').query(query);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetToSydneySeed();
  });

  describe('GET /api/certificates', () => {
    it('returns the first page newest first, with total and timezone', async () => {
      const res = await list();
      expect(res.status).toBe(200);
      const body = certificateListResponseSchema.parse(res.body);
      expect(body).toMatchObject({
        page: 1,
        pageSize: 20,
        total: SYDNEY_SEED.counts.certificates,
        timezone: 'Australia/Sydney',
      });
      expect(body.items.map((c) => c.serial)).toEqual(NEWEST_FIRST);
    });

    it('returns rows with UTC instants and copied names', async () => {
      const res = await list();
      const newYear = res.body.items.find((c: { id: number }) => c.id === C.newYear.id);
      expect(newYear).toEqual({
        id: C.newYear.id,
        serial: 'SYD-2026-000001',
        participantId: 1,
        participantName: "Ana O'Neil",
        courseId: SYDNEY_SEED.courseIds['FA-101'],
        courseTitle: 'First Aid Essentials',
        status: 'valid',
        issuedAt: '2025-12-31T13:30:00.000Z',
        revokedAt: null,
      });
      const revoked = res.body.items.find((c: { id: number }) => c.id === C.revoked.id);
      expect(revoked).toMatchObject({ status: 'revoked', revokedAt: C.revoked.revokedAt });
    });

    it('splits pages: a full page, the last partial page, then an empty page', async () => {
      const first = await list({ page: 1, pageSize: 4 });
      const last = await list({ page: 2, pageSize: 4 });
      const past = await list({ page: 3, pageSize: 4 });
      expect(first.body.items.map((c: { serial: string }) => c.serial)).toEqual(
        NEWEST_FIRST.slice(0, 4),
      );
      expect(last.body.items.map((c: { serial: string }) => c.serial)).toEqual(
        NEWEST_FIRST.slice(4),
      );
      expect(past.status).toBe(200);
      expect(past.body).toMatchObject({ items: [], page: 3, pageSize: 4, total: 6 });
    });

    it('accepts the maximum page size of 100', async () => {
      const res = await list({ pageSize: 100 });
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(6);
      expect(res.body.pageSize).toBe(100);
    });

    it.each([
      [{ pageSize: 101 }, 'pageSize', 'must be 100 or less'],
      [{ pageSize: 0 }, 'pageSize', 'must be 1 or more'],
      [{ page: 0 }, 'page', 'must be 1 or more'],
      [{ page: 'two' }, 'page', 'must be a number'],
    ])('rejects %j with 400', async (query, field, message) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(apiErrorBodySchema.parse(res.body)).toMatchObject({
        error: 'validation_failed',
        fields: { [field]: message },
      });
    });

    it('keeps pages stable when issue times are equal (id breaks the tie)', async () => {
      const at = new Date('2026-10-20T00:00:00.000Z');
      const a = await createCertificate({ issuedAt: at });
      const b = await createCertificate({ issuedAt: at });
      const c = await createCertificate({ issuedAt: at });
      const pages = [];
      for (const page of [1, 2, 3]) {
        const res = await list({ page, pageSize: 1 });
        pages.push(res.body.items[0].id);
      }
      expect(pages).toEqual([c.id, b.id, a.id]);
    });
  });

  describe('GET /api/certificates/:id', () => {
    it('returns a valid certificate in the contract shape', async () => {
      const res = await api()
        .get(`/api/certificates/${C.dstEndBefore.id}`)
        .set(TENANT_HEADER, 'SYD');
      expect(res.status).toBe(200);
      expect(certificateDetailSchema.parse(res.body)).toEqual({
        id: C.dstEndBefore.id,
        serial: 'SYD-2026-000003',
        enrollmentId: 3,
        participantId: 3,
        participantName: 'Chloé Dubois',
        courseId: SYDNEY_SEED.courseIds['FA-101'],
        courseTitle: 'First Aid Essentials',
        status: 'valid',
        issuedAt: '2026-04-04T14:30:00.000Z',
        issuedBy: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
        revokedAt: null,
        revokedBy: null,
        revokeReason: null,
        timezone: 'Australia/Sydney',
      });
    });

    it('returns a revoked certificate with who, when and why', async () => {
      const res = await api().get(`/api/certificates/${C.revoked.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'revoked',
        revokedAt: '2026-02-10T23:00:00.000Z',
        revokedBy: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
        revokeReason: 'Name misspelt on certificate',
      });
    });

    it('answers 404 for an unknown id', async () => {
      const res = await api().get('/api/certificates/999');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found', message: 'Certificate not found' });
    });

    it.each(['abc', '0', '-1', '1.5'])('answers 400 for id %j', async (id) => {
      const res = await api().get(`/api/certificates/${id}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: 'validation_failed', fields: { id: expect.any(String) } });
    });
  });
});
