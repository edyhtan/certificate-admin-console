import type { Prisma, PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { formatSerial, nextSerial, SerialService } from './serial.js';

function fakeTx(value: bigint | number) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([{ value }]),
  };
}

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

describe('formatSerial', () => {
  it.each([
    ['SYD', 2026, 1, 'SYD-2026-000001'],
    ['PER', 2027, 123, 'PER-2027-000123'],
    ['ADL', 2026, 999_999, 'ADL-2026-999999'],
  ])('%s %i %i → %s', (prefix, year, seq, serial) => {
    expect(formatSerial(prefix, year, seq)).toBe(serial);
  });

  it.each([0, -1, 1.5, 1_000_000])('rejects sequence %d', (seq) => {
    expect(() => formatSerial('SYD', 2026, seq)).toThrow(RangeError);
  });
});

describe('nextSerial', () => {
  it('bumps the year with one atomic upsert, then reads LAST_INSERT_ID on the same tx', async () => {
    const tx = fakeTx(7n);
    await expect(
      nextSerial(tx as unknown as Prisma.TransactionClient, 'SYD', 2026),
    ).resolves.toBe('SYD-2026-000007');

    const upsert = sqlOf(tx.$executeRaw.mock.calls[0]);
    expect(upsert).toContain('INSERT INTO serial_counter (`year`, `last_value`) VALUES (?, LAST_INSERT_ID(1))');
    expect(upsert).toContain('ON DUPLICATE KEY UPDATE `last_value` = LAST_INSERT_ID(`last_value` + 1)');
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(2026);
    expect(sqlOf(tx.$queryRaw.mock.calls[0])).toBe('SELECT LAST_INSERT_ID() AS value');
  });

  it('accepts a plain number from the driver too', async () => {
    await expect(
      nextSerial(fakeTx(1) as unknown as Prisma.TransactionClient, 'PER', 2027),
    ).resolves.toBe('PER-2027-000001');
  });
});

describe('SerialService', () => {
  function serviceFor(timeZone: string, serialPrefix: string) {
    return new SerialService(
      new FixedAppContext({
        db: {} as PrismaClient,
        timeZone,
        serialPrefix,
        actor: { id: 1, name: 'Administrator' },
      }),
    );
  }

  it('uses the tenant prefix and the tenant-local year', async () => {
    const tx = fakeTx(1n);
    // 15:30 UTC on 31 Dec 2026 is 23:30 in Perth: still 2026 there.
    await expect(
      serviceFor('Australia/Perth', 'PER').next(
        tx as unknown as Prisma.TransactionClient,
        new Date('2026-12-31T15:30:00Z'),
      ),
    ).resolves.toBe('PER-2026-000001');
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(2026);
  });

  it('starts the new year in Sydney before UTC does', async () => {
    const tx = fakeTx(1n);
    await serviceFor('Australia/Sydney', 'SYD').next(
      tx as unknown as Prisma.TransactionClient,
      new Date('2025-12-31T13:30:00Z'),
    );
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(2026);
  });
});
