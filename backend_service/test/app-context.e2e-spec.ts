import { TENANT_HEADER } from '@cert/shared';
import { Controller, Get, Injectable, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { inject } from 'vitest';
import { AppConfig } from '../src/config/app-config.js';
import { AppContext } from '../src/core/context/app-context.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { testAppContext } from './support/app-context.js';
import { resetToSydneySeed, TEST_ADMIN, testDb } from './support/db.js';
import { createTestApp } from './support/test-app.js';

/** Shaped like a core service: injects AppContext and takes no context argument. */
@Injectable()
class SampleCoreService {
  constructor(private readonly ctx: AppContext) {}

  async snapshot() {
    const [{ name }] = await this.ctx.db.$queryRaw<{ name: string }[]>`
      SELECT DATABASE() AS name`;
    return {
      database: name,
      timeZone: this.ctx.timeZone,
      serialPrefix: this.ctx.serialPrefix,
      actor: this.ctx.actor,
      now: this.ctx.now().toISOString(),
    };
  }
}

@Controller('_test')
class SampleController {
  constructor(private readonly service: SampleCoreService) {}

  @Get('context')
  context() {
    return this.service.snapshot();
  }
}

const testDatabaseName = () => inject('databaseUrl').split('/').pop();

describe('AppContext single-tenant binding (e2e)', () => {
  describe('real binding', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({
        controllers: [SampleController],
        providers: [SampleCoreService],
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('gives a core service the Sydney database, timezone, prefix and admin actor', async () => {
      const res = await request(app.getHttpServer()).get('/api/_test/context');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        database: testDatabaseName(),
        timeZone: 'Australia/Sydney',
        serialPrefix: 'SYD',
        actor: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
        now: expect.any(String),
      });
    });

    it('reports the database and the admin row as up in the health check', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        checks: {
          database: { status: 'up', durationMs: expect.any(Number) },
          admin: { status: 'up', durationMs: expect.any(Number) },
        },
      });
    });
  });

  describe('real binding, started before the admin row exists', () => {
    const db = testDb();
    let app: INestApplication;
    // Renaming the row hides it from the `admin` lookup without breaking foreign keys.
    const setAdminUsername = (username: string) =>
      db.admin.update({ where: { id: TEST_ADMIN.id }, data: { username } });
    const health = () => request(app.getHttpServer()).get('/api/health');
    const revoke = () =>
      request(app.getHttpServer())
        .post(`/api/certificates/${SYDNEY_SEED.certificates.newYear.id}/revoke`)
        .set(TENANT_HEADER, 'SYD')
        .send({});

    beforeEach(async () => {
      await resetToSydneySeed();
      await setAdminUsername('not-admin-yet');
      app = await createTestApp();
    });

    afterEach(async () => {
      await app.close();
      await setAdminUsername(TEST_ADMIN.username);
    });

    it('answers 503 with the admin check down, then 200 once the row exists, without a restart', async () => {
      let res = await health();
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'error',
        checks: {
          database: { status: 'up', durationMs: expect.any(Number) },
          admin: { status: 'down', durationMs: expect.any(Number) },
        },
      });

      await setAdminUsername(TEST_ADMIN.username);
      res = await health();
      expect(res.status).toBe(200);
      expect(res.body.checks.admin.status).toBe('up');
    });

    it('refuses writes without an actor, then writes once the row exists, without a restart', async () => {
      let res = await revoke();
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('internal_error');

      await setAdminUsername(TEST_ADMIN.username);
      res = await revoke();
      expect(res.status).toBe(200);
      expect(res.body.revokedBy).toEqual({ id: TEST_ADMIN.id, name: TEST_ADMIN.name });
    });
  });

  describe('fixed binding from the test helper', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({
        controllers: [SampleController],
        providers: [SampleCoreService],
        context: testAppContext({
          now: () => new Date('2026-01-01T00:30:00+11:00'),
        }),
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('replaces the single-tenant binding, e.g. with a fixed clock', async () => {
      const res = await request(app.getHttpServer()).get('/api/_test/context');
      expect(res.body).toMatchObject({
        database: testDatabaseName(),
        serialPrefix: 'SYD',
        now: '2025-12-31T13:30:00.000Z',
      });
    });
  });

  describe('database unreachable', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp({
        configure: (builder) =>
          builder.overrideProvider(AppConfig).useValue(
            new AppConfig({
              apiPort: 0,
              // Nothing listens on port 1, so connections are refused at once.
              databaseUrl: 'mysql://root:root@127.0.0.1:1/cert_unreachable',
              timeZone: 'Australia/Sydney',
              serialPrefix: 'SYD',
            }),
          ),
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('still starts, and the health check answers 503 with the database and admin row down', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'error',
        checks: {
          database: { status: 'down', durationMs: expect.any(Number) },
          admin: { status: 'down', durationMs: expect.any(Number) },
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    });
  });
});
