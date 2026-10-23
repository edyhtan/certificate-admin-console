import { inject } from 'vitest';
import { closeTestDb } from './db.js';

// Runs in every e2e worker before the test files load, so AppModule's config reads these.
// M1-M2 run as the Sydney tenant (D48).
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_TIMEZONE = 'Australia/Sydney';
process.env.APP_SERIAL_PREFIX = 'SYD';

afterAll(async () => {
  await closeTestDb();
});
