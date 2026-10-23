import { inject } from 'vitest';
import { closeTestDb } from './db.js';

// Runs in every e2e worker before the test files load, so AppModule's config reads these.
const base = inject('databaseUrlBase');
const prefix = inject('tenantDatabasePrefix');
process.env.DATABASE_URL_BASE = base;
process.env.TENANT_DATABASE_PREFIX = prefix;

afterAll(async () => {
  await closeTestDb();
});
