import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppContext } from '../context/app-context.js';
import { localYear } from '../time/local-time.js';

const MAX_SEQUENCE = 999_999;

/** `SYD`, 2026, 123 → `SYD-2026-000123` (D13). */
export function formatSerial(prefix: string, year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError(`serial sequence ${sequence} is outside 1–${MAX_SEQUENCE}`);
  }
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Takes the next number for `year` and returns the formatted serial (spec §5.2, D37).
 *
 * Must run inside the issue transaction (`tx`):
 * - one atomic statement bumps the year's counter (or creates it at 1) and remembers the value
 *   in this connection's `LAST_INSERT_ID()`, so no two transactions get the same number;
 * - the counter row stays locked until the transaction ends, and a rollback gives the number back.
 * `year` and `last_value` are quoted: `last_value` is a reserved word in MySQL 8 (D55).
 */
export async function nextSerial(
  tx: Prisma.TransactionClient,
  prefix: string,
  year: number,
): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO serial_counter (\`year\`, \`last_value\`) VALUES (${year}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE \`last_value\` = LAST_INSERT_ID(\`last_value\` + 1)`;
  const [row] = await tx.$queryRaw<{ value: bigint | number }[]>`SELECT LAST_INSERT_ID() AS value`;
  return formatSerial(prefix, year, Number(row.value));
}

/** The tenant's next serial for an issue at `issuedAt`: its prefix and its local year. */
@Injectable()
export class SerialService {
  constructor(private readonly ctx: AppContext) {}

  next(tx: Prisma.TransactionClient, issuedAt: Date): Promise<string> {
    return nextSerial(tx, this.ctx.serialPrefix, localYear(issuedAt, this.ctx.timeZone));
  }
}
