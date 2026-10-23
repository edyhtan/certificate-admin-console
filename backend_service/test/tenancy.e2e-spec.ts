import { apiErrorBodySchema, TENANT_HEADER, tenantListResponseSchema } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CoursesService } from '../src/core/courses/courses.service.js';
import { NoTenantScopeError } from '../src/tenancy/tenant-app-context.js';
import { TenantScopes } from '../src/tenancy/tenant-scopes.js';
import { TEST_ADMIN, testDb } from './support/db.js';
import { api, createTestApp } from './support/test-app.js';

describe('Tenancy (e2e)', () => {
  let app: INestApplication;
  const raw = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/tenants', () => {
    it('lists the tenants without a header, and never their databases', async () => {
      const res = await raw().get('/api/tenants');
      expect(res.status).toBe(200);
      expect(tenantListResponseSchema.parse(res.body)).toEqual({
        items: [
          { code: 'SYD', name: 'Sydney', timezone: 'Australia/Sydney' },
          { code: 'PER', name: 'Perth', timezone: 'Australia/Perth' },
          { code: 'ADL', name: 'Adelaide', timezone: 'Australia/Adelaide' },
        ],
      });
      expect(res.text).not.toMatch(/cert_/);
    });

    it('ignores a header if one is sent', async () => {
      expect((await raw().get('/api/tenants').set(TENANT_HEADER, 'XYZ')).status).toBe(200);
    });
  });

  describe('tenant_id header', () => {
    it('is not needed for GET /api/health', async () => {
      expect((await raw().get('/api/health')).status).toBe(200);
    });

    it('missing → 400 unknown_tenant', async () => {
      const res = await raw().get('/api/courses');
      expect(res.status).toBe(400);
      expect(apiErrorBodySchema.parse(res.body)).toEqual({
        error: 'unknown_tenant',
        message: 'Missing tenant_id header',
      });
    });

    it.each(['XYZ', 'syd', 'SYDNEY', ''])('%j → 400 unknown_tenant', async (code) => {
      const res = await raw().get('/api/certificates').set(TENANT_HEADER, code);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown_tenant');
    });

    it('is checked before validation and before writes', async () => {
      const res = await raw().post('/api/courses').send({ code: 'X' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown_tenant');
    });

    it('is checked on unknown routes too', async () => {
      expect((await raw().get('/api/nope')).body.error).toBe('unknown_tenant');
      expect((await api(app).get('/api/nope')).status).toBe(404);
    });

    it.each(['SYD', 'PER', 'ADL'] as const)('%s reaches that tenant’s data', async (code) => {
      await testDb(code).course.create({ data: { code: `ONLY-${code}`, title: `${code} only` } });
      const res = await api(app, code).get('/api/courses');
      const codes = res.body.items.map((c: { code: string }) => c.code);
      expect(codes).toContain(`ONLY-${code}`);
      for (const other of ['SYD', 'PER', 'ADL'].filter((c) => c !== code)) {
        expect(codes).not.toContain(`ONLY-${other}`);
      }
      await testDb(code).course.deleteMany({ where: { code: `ONLY-${code}` } });
    });
  });

  describe('a tenant database without its admin row', () => {
    let fresh: INestApplication;

    beforeAll(async () => {
      await testDb('ADL').admin.deleteMany();
      fresh = await createTestApp(); // new app, so no actor is cached yet
    });

    afterAll(async () => {
      await testDb('ADL').admin.create({ data: TEST_ADMIN });
      await fresh.close();
    });

    it('answers 500 without details, and other tenants still work', async () => {
      const res = await api(fresh, 'ADL').get('/api/courses');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'internal_error', message: 'Something went wrong' });
      expect((await api(fresh, 'SYD').get('/api/courses')).status).toBe(200);
    });
  });

  describe('outside a request', () => {
    it('a core service throws with no tenant scope', async () => {
      await expect(app.get(CoursesService).list()).rejects.toBeInstanceOf(NoTenantScopeError);
    });

    it('runInTenant gives a core service that tenant', async () => {
      await testDb('PER').course.create({ data: { code: 'RUN-PER', title: 'Run in Perth' } });
      const scopes = app.get(TenantScopes);
      const courses = app.get(CoursesService);
      const per = await scopes.runInTenant('PER', () => courses.list());
      const syd = await scopes.runInTenant('SYD', () => courses.list());
      expect(per.items.map((c) => c.code)).toContain('RUN-PER');
      expect(syd.items.map((c) => c.code)).not.toContain('RUN-PER');
      await testDb('PER').course.deleteMany({ where: { code: 'RUN-PER' } });
    });
  });
});
