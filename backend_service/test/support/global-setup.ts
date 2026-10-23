import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';
import { loadEnvFile } from '../../src/config/load-env-file.js';
import {
  TENANT_CODES,
  tenantDatabaseName,
  tenantDatabaseUrl,
} from '../../src/tenancy/tenants.js';
import { TEST_ADMIN } from './db.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Server URL the test databases live on (no database). */
    databaseUrlBase: string;
    /** Prefix of this run's tenant databases, e.g. `cert_test_mvk7vzhe_1234_`. */
    tenantDatabasePrefix: string;
  }
}

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_BASE = 'mysql://root:root@127.0.0.1:3307';
/** `cert_test_<time36>_<pid>_<tenant database>`. Only these are ever dropped. */
const NAME_PATTERN = /^cert_test_([a-z0-9]+)_\d+_[a-z0-9_]+$/;
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Runs once per `vitest` run: create → migrate one throwaway database per registry tenant
 * (with an `admin` row each); drop them all at the end.
 */
export default async function setup(project: TestProject) {
  loadEnvFile();
  const base = (process.env.DATABASE_URL_BASE ?? DEFAULT_BASE).replace(/\/+$/, '');
  const prefix = `cert_test_${Date.now().toString(36)}_${process.pid}_`;
  const names = TENANT_CODES.map((code) => tenantDatabaseName(code, prefix));

  // Admin connection on the server's own `mysql` schema, for CREATE/DROP DATABASE.
  const admin = new PrismaClient({ datasourceUrl: `${base}/mysql` });
  await dropStaleDatabases(admin);

  await Promise.all(
    names.map(async (name) => {
      // `migrate deploy` creates the database when it doesn't exist.
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: tenantDatabaseUrl(base, name) },
        stdio: 'pipe',
      });
      // The app needs each tenant's actor (the admin row).
      const db = new PrismaClient({ datasourceUrl: tenantDatabaseUrl(base, name) });
      await db.admin.create({ data: TEST_ADMIN });
      await db.$disconnect();
    }),
  );

  project.provide('databaseUrlBase', base);
  project.provide('tenantDatabasePrefix', prefix);

  return async () => {
    for (const name of names) await dropDatabase(admin, name);
    await admin.$disconnect();
  };
}

async function dropDatabase(admin: PrismaClient, name: string) {
  // Guard: only ever drop databases this harness created.
  if (!NAME_PATTERN.test(name)) throw new Error(`refusing to drop ${name}`);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${name}\``);
}

/** Removes databases left behind by runs that crashed before teardown. */
async function dropStaleDatabases(admin: PrismaClient) {
  const rows = await admin.$queryRaw<{ name: string }[]>`
    SELECT schema_name AS name FROM information_schema.schemata
    WHERE schema_name LIKE 'cert\\_test\\_%'`;
  for (const { name } of rows) {
    const match = NAME_PATTERN.exec(name) ?? /^cert_test_([a-z0-9]+)_\d+$/.exec(name);
    if (!match) continue;
    if (Date.now() - parseInt(match[1], 36) > STALE_AFTER_MS) {
      // Older runs used `cert_test_<time>_<pid>` with no tenant suffix.
      if (NAME_PATTERN.test(name) || /^cert_test_[a-z0-9]+_\d+$/.test(name)) {
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${name}\``);
      }
    }
  }
}
