import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { SYDNEY_SEED } from '../../src/seed/manifest.js';
import { SYDNEY } from '../../src/seed/profiles/sydney.js';
import { seed, type SeedResult } from '../../src/seed/seed.js';

let client: PrismaClient | undefined;

/** The harness's own client on this run's throwaway database, for factories and assertions. */
export function testDb(): PrismaClient {
  client ??= new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  return client;
}

export async function closeTestDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/**
 * Runs a plain SQL script on the test database through `prisma db execute`, for statements
 * MySQL can't prepare (CREATE/DROP TRIGGER, error 1295), which Prisma's raw queries always do.
 */
export function execSql(sql: string): void {
  execFileSync('npx', ['prisma', 'db', 'execute', '--stdin', '--url', process.env.DATABASE_URL ?? ''], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * The single `admin` row every request acts as. `resetDatabase` and `resetToSydneySeed`
 * both leave it as id 1 with these values.
 */
export const TEST_ADMIN = { id: 1, username: 'admin', name: 'Administrator' };

/** Empties every table except `_prisma_migrations`. Ids restart from 1. */
async function truncateAll(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'`;

  // One interactive transaction keeps every statement on the same connection,
  // which the session-level FOREIGN_KEY_CHECKS setting needs.
  // TRUNCATE doesn't fire the audit_event DELETE trigger.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });
}

/** An empty database with only the `admin` row, for tests that build their own data. */
export async function resetDatabase(db: PrismaClient = testDb()): Promise<void> {
  await truncateAll(db);
  await db.admin.create({ data: TEST_ADMIN });
}

/**
 * The default starting state for M1-M2 API tests: an empty database loaded with the Sydney
 * seed (D48). Ids match `SYDNEY_SEED`. Factories can add rows on top.
 */
export async function resetToSydneySeed(
  db: PrismaClient = testDb(),
): Promise<SeedResult> {
  await truncateAll(db);
  const result = await seed(db, SYDNEY);
  if (result.adminId !== TEST_ADMIN.id || SYDNEY_SEED.admin.name !== TEST_ADMIN.name) {
    throw new Error('Sydney seed admin no longer matches TEST_ADMIN');
  }
  return result;
}
