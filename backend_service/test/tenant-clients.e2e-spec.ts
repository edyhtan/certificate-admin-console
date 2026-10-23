import type { INestApplication } from '@nestjs/common';
import { TenantDatabases } from '../src/tenancy/tenant-databases.js';
import { TENANT_CODES } from '../src/tenancy/tenants.js';
import { testDatabaseName } from './support/db.js';
import { createTestApp } from './support/test-app.js';

describe('Tenant databases (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts the app with one client per tenant, each on its own database', async () => {
    const databases = app.get(TenantDatabases);
    expect(databases.entries()).toHaveLength(3);
    for (const code of TENANT_CODES) {
      const [{ name }] = await databases.client(code).$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
      expect(name).toBe(testDatabaseName(code));
    }
  });
});
