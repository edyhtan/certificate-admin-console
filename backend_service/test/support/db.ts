import { PrismaClient } from '@prisma/client';

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

/** The single `admin` row every request acts as. `resetDatabase` always recreates it as id 1. */
export const TEST_ADMIN = { id: 1, username: 'admin', name: 'Administrator' };

/**
 * Empties every table and recreates the `admin` row, so each suite starts from the same state.
 * TRUNCATE resets auto-increment ids and doesn't fire the audit_event DELETE trigger.
 */
export async function resetDatabase(db: PrismaClient = testDb()): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'`;

  // One interactive transaction keeps every statement on the same connection,
  // which the session-level FOREIGN_KEY_CHECKS setting needs.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    await tx.admin.create({ data: TEST_ADMIN });
  });
}
