import { nextSerial } from '../src/core/serials/serial.js';
import { resetToSydneySeed, testDb } from './support/db.js';

/** A promise plus the function that resolves it, to hold a transaction open on purpose. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

const counter = async (year: number) =>
  (await testDb().serialCounter.findUnique({ where: { year } }))?.lastValue ?? null;

describe('serial generator against MySQL (e2e)', () => {
  const db = testDb();

  beforeEach(async () => {
    await resetToSydneySeed(); // 2026 counter at 6
  });

  it('carries on from the seeded counter', async () => {
    const first = await db.$transaction((tx) => nextSerial(tx, 'SYD', 2026));
    const second = await db.$transaction((tx) => nextSerial(tx, 'SYD', 2026));
    expect([first, second]).toEqual(['SYD-2026-000007', 'SYD-2026-000008']);
    expect(await counter(2026)).toBe(8);
  });

  it('starts a new year at 1 and leaves other years alone', async () => {
    const serial = await db.$transaction((tx) => nextSerial(tx, 'SYD', 2027));
    expect(serial).toBe('SYD-2027-000001');
    expect(await counter(2027)).toBe(1);
    expect(await counter(2026)).toBe(6);
  });

  it('gives the number back when the transaction rolls back', async () => {
    let taken = '';
    await expect(
      db.$transaction(async (tx) => {
        taken = await nextSerial(tx, 'SYD', 2026);
        throw new Error('certificate insert failed');
      }),
    ).rejects.toThrow('certificate insert failed');
    expect(taken).toBe('SYD-2026-000007');
    expect(await counter(2026)).toBe(6);

    const again = await db.$transaction((tx) => nextSerial(tx, 'SYD', 2026));
    expect(again).toBe('SYD-2026-000007');
  });

  it('makes a parallel transaction wait for the first one and take the next number', async () => {
    const hold = gate();
    const first = db.$transaction(async (tx) => {
      const serial = await nextSerial(tx, 'SYD', 2026);
      await hold.opened; // keep the counter row locked
      return serial;
    });
    // Let the first transaction take its number before the second starts.
    await new Promise((r) => setTimeout(r, 100));

    let secondDone = false;
    const second = db
      .$transaction((tx) => nextSerial(tx, 'SYD', 2026))
      .then((s) => {
        secondDone = true;
        return s;
      });
    await new Promise((r) => setTimeout(r, 300));
    expect(secondDone).toBe(false); // blocked on the row lock

    hold.open();
    expect(await first).toBe('SYD-2026-000007');
    expect(await second).toBe('SYD-2026-000008');
  });

  it('hands the waiting transaction the number a rolled-back one gave up', async () => {
    const hold = gate();
    const first = db.$transaction(async (tx) => {
      await nextSerial(tx, 'SYD', 2026);
      await hold.opened;
      throw new Error('roll back');
    });
    await new Promise((r) => setTimeout(r, 100));
    const second = db.$transaction((tx) => nextSerial(tx, 'SYD', 2026));
    await new Promise((r) => setTimeout(r, 100));
    hold.open();
    await expect(first).rejects.toThrow('roll back');
    expect(await second).toBe('SYD-2026-000007');
  });

  it('gives 10 concurrent transactions 10 different, consecutive numbers', async () => {
    const serials = await Promise.all(
      Array.from({ length: 10 }, () => db.$transaction((tx) => nextSerial(tx, 'SYD', 2026))),
    );
    expect(new Set(serials).size).toBe(10);
    expect([...serials].sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `SYD-2026-${String(7 + i).padStart(6, '0')}`),
    );
    expect(await counter(2026)).toBe(16);
  });
});
