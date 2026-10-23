/**
 * `npm run db:setup`, after `prisma migrate deploy`: seeds the configured database if it has
 * no `admin` row yet. Safe to run any number of times. M1-M2: the one Sydney database (D48).
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadAppConfig } from '../config/app-config.js';
import { loadEnvFile } from '../config/load-env-file.js';
import { SEED_PROFILES } from './profiles/index.js';
import { isSeeded, seed } from './seed.js';
import type { SeedProfile } from './seed-profile.js';

/** The seed profile for this config. Fails if prefix and timezone don't belong together. */
export function profileFor(serialPrefix: string, timeZone: string): SeedProfile {
  const profile = SEED_PROFILES[serialPrefix];
  if (!profile) {
    throw new Error(`no seed profile for APP_SERIAL_PREFIX=${serialPrefix}`);
  }
  if (profile.timeZone !== timeZone) {
    throw new Error(
      `seed profile ${serialPrefix} is for ${profile.timeZone}, but APP_TIMEZONE=${timeZone}`,
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

async function main() {
  loadEnvFile();
  const config = loadAppConfig(process.env);
  const profile = profileFor(config.serialPrefix, config.timeZone);
  const db = new PrismaClient({ datasourceUrl: config.databaseUrl });
  try {
    const outcome = await setUpDatabase(db, profile);
    const name = new URL(config.databaseUrl).pathname.slice(1);
    console.log(`db:setup: ${name} ${outcome} (${profile.serialPrefix}, ${profile.timeZone})`);
  } finally {
    await db.$disconnect();
  }
}

// Run only as a script, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
