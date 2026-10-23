import { apiErrorBodySchema, TENANT_HEADER, tenantListResponseSchema } from '@cert/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CoursesService } from '../src/core/courses/courses.service.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { testDb } from './support/db.js';
import { createTestApp } from './support/test-app.js';

/**
 * The tenancy module's HTTP surface. Header rules in detail are in tenant.middleware.spec.ts,
 * per-tenant binding in app-context.e2e-spec.ts, cross-tenant access in isolation.e2e-spec.ts.
 */
describe('Tenancy (e2e)', () => {
  let app: INestApplication;
  const raw = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/tenants lists the tenants without a header, never their databases', async () => {
    const res = await raw().get('/api/tenants');
    expect(res.status).toBe(200);
    expect(tenantListResponseSchema.parse(res.body).items.map((t) => t.code)).toEqual(['SYD', 'PER', 'ADL']);
    expect(res.text).not.toMatch(/cert_/);
  });

  it('GET /api/health needs no header', async () => {
    expect((await raw().get('/api/health')).status).toBe(200);
  });

  it('a missing tenant_id is 400 unknown_tenant', async () => {
    const res = await raw().get('/api/courses');
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body)).toEqual({ error: 'unknown_tenant', message: 'Missing tenant_id header' });
  });

  it('an unknown tenant_id is 400 unknown_tenant', async () => {
    const res = await raw().get('/api/certificates').set(TENANT_HEADER, 'XYZ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_tenant');
  });

  it('context.run gives a core service a tenant outside a request, and none without it', async () => {
    await testDb('PER').course.create({ data: { code: 'RUN-PER', title: 'Run in Perth' } });
    const context = app.get(TenantContext);
    const courses = app.get(CoursesService);
    const per = await context.run('PER', () => courses.list());
    const syd = await context.run('SYD', () => courses.list());
    expect(per.items.map((c) => c.code)).toContain('RUN-PER');
    expect(syd.items.map((c) => c.code)).not.toContain('RUN-PER');
    await expect(courses.list()).rejects.toThrow();
    await testDb('PER').course.deleteMany({ where: { code: 'RUN-PER' } });
  });
});
