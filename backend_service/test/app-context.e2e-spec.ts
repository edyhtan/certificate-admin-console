import { Controller, Get, Injectable, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppConfig } from '../src/config/app-config.js';
import { AppContext } from '../src/core/context/app-context.js';
import { testAppContext } from './support/app-context.js';
import { SYDNEY_SEED } from '../src/seed/manifest.js';
import { resetToSydneySeed, TEST_ADMIN, testDatabaseName, testDb } from './support/db.js';
import { api, createTestApp } from './support/test-app.js';

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


describe('AppContext tenant binding (e2e)', () => {
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
      const res = await api(app).get('/api/_test/context');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        database: testDatabaseName(),
        timeZone: 'Australia/Sydney',
        serialPrefix: 'SYD',
        actor: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
        now: expect.any(String),
      });
    });

    it.each([
      ['PER', 'Australia/Perth'],
      ['ADL', 'Australia/Adelaide'],
    ] as const)('gives the same core service %s’s database, timezone and prefix', async (code, timeZone) => {
      const res = await api(app, code).get('/api/_test/context');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        database: testDatabaseName(code),
        timeZone,
        serialPrefix: code,
        actor: { id: TEST_ADMIN.id, name: TEST_ADMIN.name },
      });
    });

    it('reports every tenant database as up in the health check, without a tenant header', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
      const up = { status: 'up', durationMs: expect.any(Number) };
      expect(res.body).toEqual({
        status: 'ok',
        checks: {
          'database:SYD': up,
          'admin:SYD': up,
          'database:PER': up,
          'admin:PER': up,
          'database:ADL': up,
          'admin:ADL': up,
        },
      });
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
      const res = await api(app).get('/api/_test/context');
      expect(res.body).toMatchObject({
        database: testDatabaseName(),
        serialPrefix: 'SYD',
        now: '2025-12-31T13:30:00.000Z',
      });
    });
  });

  describe('a tenant started before its admin row exists', () => {
    const db = testDb('SYD');
    let app: INestApplication;
    // Renaming the row hides it from the `admin` lookup without breaking foreign keys.
    const setAdminUsername = (username: string) =>
      db.admin.update({ where: { id: TEST_ADMIN.id }, data: { username } });
    const health = () => request(app.getHttpServer()).get('/api/health');
    const revoke = () =>
      api(app, 'SYD').post(`/api/certificates/${SYDNEY_SEED.certificates.newYear.id}/revoke`).send({});

    beforeEach(async () => {
      await resetToSydneySeed();
      await setAdminUsername('not-admin-yet');
      app = await createTestApp(); // fresh app, so no actor is cached
    });

    afterEach(async () => {
      await app.close();
      await setAdminUsername(TEST_ADMIN.username);
    });

    it('answers 503 with only that tenant’s admin check down, then 200 once the row exists', async () => {
      let res = await health();
      expect(res.status).toBe(503);
      expect(res.body.checks['admin:SYD'].status).toBe('down');
      expect(res.body.checks['database:SYD'].status).toBe('up');
      expect(res.body.checks['admin:PER'].status).toBe('up');

      await setAdminUsername(TEST_ADMIN.username);
      res = await health();
      expect(res.status).toBe(200);
      expect(res.body.checks['admin:SYD'].status).toBe('up');
    });

    it('refuses that tenant’s requests until the row exists, then works without a restart', async () => {
      let res = await revoke();
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('internal_error');
      expect((await api(app, 'PER').get('/api/courses')).status).toBe(200);

      await setAdminUsername(TEST_ADMIN.username);
      res = await revoke();
      expect(res.status).toBe(200);
      expect(res.body.revokedBy).toEqual({ id: TEST_ADMIN.id, name: TEST_ADMIN.name });
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
              databaseUrlBase: 'mysql://root:root@127.0.0.1:1',
            }),
          ),
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('still starts, and the health check answers 503 with every tenant database down', async () => {
      const res = await api(app).get('/api/health');
      expect(res.status).toBe(503);
      const down = { status: 'down', durationMs: expect.any(Number) };
      expect(res.body).toEqual({
        status: 'error',
        checks: {
          'database:SYD': down,
          'admin:SYD': down,
          'database:PER': down,
          'admin:PER': down,
          'database:ADL': down,
          'admin:ADL': down,
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('127.0.0.1');
    });
  });
});
