import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { TestProject } from 'vitest/node';
import { loadEnvFile } from '../../src/config/load-env-file.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL of this run's throwaway database. */
    databaseUrl: string;
  }
}

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_BASE = 'mysql://root:root@127.0.0.1:3307';
const NAME_PATTERN = /^cert_test_([a-z0-9]+)_\d+$/;
const STALE_AFTER_MS = 60 * 60 * 1000;

/** Runs once per `vitest` run: create → migrate a throwaway database; drop it at the end. */
export default async function setup(project: TestProject) {
  loadEnvFile();
  const base = (process.env.DATABASE_URL_BASE ?? DEFAULT_BASE).replace(
    /\/+$/,
    '',
  );
  const name = `cert_test_${Date.now().toString(36)}_${process.pid}`;
  const databaseUrl = `${base}/${name}`;

  // Admin connection on the server's own `mysql` schema, for CREATE/DROP DATABASE.
  const admin = new PrismaClient({ datasourceUrl: `${base}/mysql` });
  await dropStaleDatabases(admin);

  // `migrate deploy` creates the database when it doesn't exist.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await dropDatabase(admin, name);
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
    const match = NAME_PATTERN.exec(name);
    if (!match) continue;
    const createdAt = parseInt(match[1], 36);
    if (Date.now() - createdAt > STALE_AFTER_MS) {
      await dropDatabase(admin, name);
    }
  }
}
