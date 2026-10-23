/**
 * `npm run db:setup`: for every registry tenant, create its database if missing, apply the
 * migrations, and seed it with that tenant's profile if it has no `admin` row yet (spec §7).
 * Safe to run any number of times. Adding a tenant = adding it to the registry and re-running.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadAppConfig } from '../config/app-config.js';
import { loadEnvFile } from '../config/load-env-file.js';
import {
  TENANT_CODES,
  tenantDatabaseName,
  tenantDatabaseUrl,
  TENANTS,
  type TenantCode,
} from '../tenancy/tenants.js';
import { SEED_PROFILES } from './profiles/index.js';
import { isSeeded, seed } from './seed.js';
import type { SeedProfile } from './seed-profile.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The tenant's seed profile. Fails if it doesn't match the registry's zone and code. */
export function profileFor(code: TenantCode): SeedProfile {
  const profile = SEED_PROFILES[code];
  if (!profile) throw new Error(`no seed profile for tenant ${code}`);
  if (profile.serialPrefix !== code) {
    throw new Error(`seed profile for ${code} uses serial prefix ${profile.serialPrefix}`);
  }
  if (profile.timeZone !== TENANTS[code].timezone) {
    throw new Error(
      `seed profile for ${code} is for ${profile.timeZone}, but the registry says ${TENANTS[code].timezone}`,
    );
  }
  return profile;
}

/** Seeds when needed. Returns what happened, for the log line. */
export async function setUpDatabase(
  db: PrismaClient,
  profile: SeedProfile,
): Promise<'seeded' | 'already seeded'> {
  if (await isSeeded(db)) return 'already seeded';
  await seed(db, profile);
  return 'seeded';
}

export interface TenantSetupResult {
  code: TenantCode;
  database: string;
  outcome: 'seeded' | 'already seeded';
}

/**
 * Creates, migrates and seeds each tenant's database. `prefix` is for tests' throwaway
 * databases; it is empty in development.
 */
export async function setUpTenants(options: {
  base: string;
  prefix?: string;
  codes?: readonly TenantCode[];
}): Promise<TenantSetupResult[]> {
  const { base, prefix = '', codes = TENANT_CODES } = options;
  const server = new PrismaClient({ datasourceUrl: tenantDatabaseUrl(base, 'mysql', 1) });
  const results: TenantSetupResult[] = [];
  try {
    for (const code of codes) {
      const database = tenantDatabaseName(code, prefix);
      if (!/^[a-z0-9_]+$/.test(database)) throw new Error(`unsafe database name ${database}`);
      const profile = profileFor(code);

      await server.$executeRawUnsafe(
        `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
      );
      const url = tenantDatabaseUrl(base, database);
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      });

      const db = new PrismaClient({ datasourceUrl: url });
      try {
        results.push({ code, database, outcome: await setUpDatabase(db, profile) });
      } finally {
        await db.$disconnect();
      }
    }
  } finally {
    await server.$disconnect();
  }
  return results;
}

async function main() {
  loadEnvFile();
  const config = loadAppConfig(process.env);
  const results = await setUpTenants({
    base: config.databaseUrlBase,
    prefix: config.tenantDatabasePrefix,
  });
  for (const r of results) {
    console.log(`db:setup: ${r.code} ${r.database} ${r.outcome} (${TENANTS[r.code].timezone})`);
  }
}

// Run only as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
