import { inject } from 'vitest';
import { tenantDatabaseName, tenantDatabaseUrl } from '../../src/tenancy/tenants.js';
import { closeTestDb } from './db.js';

// Runs in every e2e worker before the test files load, so AppModule's config reads these.
const base = inject('databaseUrlBase');
const prefix = inject('tenantDatabasePrefix');
process.env.DATABASE_URL_BASE = base;
process.env.TENANT_DATABASE_PREFIX = prefix;
// The single-tenant binding (until M3.T2) runs as Sydney on Sydney's test database (D48).
process.env.DATABASE_URL = tenantDatabaseUrl(base, tenantDatabaseName('SYD', prefix));
process.env.APP_TIMEZONE = 'Australia/Sydney';
process.env.APP_SERIAL_PREFIX = 'SYD';

afterAll(async () => {
  await closeTestDb();
});
