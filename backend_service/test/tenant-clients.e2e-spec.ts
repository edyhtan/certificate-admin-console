import type { INestApplication } from '@nestjs/common';
import { TenantClients } from '../src/tenancy/tenant-clients.js';
import { TENANT_CODES } from '../src/tenancy/tenants.js';
import { testDatabaseName } from './support/db.js';
import { createTestApp } from './support/test-app.js';

describe('Tenant clients (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts the app with one client per tenant, each on its own database', async () => {
    const clients = app.get(TenantClients);
    expect(clients.entries()).toHaveLength(3);
    for (const code of TENANT_CODES) {
      const [{ name }] = await clients.get(code).$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
      expect(name).toBe(testDatabaseName(code));
    }
  });

  it('keeps each client to its own data', async () => {
    const clients = app.get(TenantClients);
    await clients.get('PER').course.create({ data: { code: 'PER-ONLY', title: 'Perth only' } });
    expect(await clients.get('PER').course.count({ where: { code: 'PER-ONLY' } })).toBe(1);
    expect(await clients.get('SYD').course.count({ where: { code: 'PER-ONLY' } })).toBe(0);
    expect(await clients.get('ADL').course.count({ where: { code: 'PER-ONLY' } })).toBe(0);
    await clients.get('PER').course.deleteMany({ where: { code: 'PER-ONLY' } });
  });
});
