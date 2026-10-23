import type { PrismaClient } from '@prisma/client';
import { SYDNEY } from './profiles/sydney.js';
import { isSeeded, parseSerial, seed, serialCounters } from './seed.js';
import type { SeedProfile } from './seed-profile.js';

type Row = Record<string, unknown> & { id: number };

/** A stand-in for Prisma: each model's `create` stores the row and gives it the next id. */
function fakeDb() {
  const tables: Record<string, Row[]> = {};
  const model = (name: string) => ({
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const rows = (tables[name] ??= []);
      const row = { id: rows.length + 1, ...data };
      rows.push(row);
      return row;
    }),
  });
  const tx = {
    admin: model('admin'),
    course: model('course'),
    participant: model('participant'),
    enrollment: model('enrollment'),
    certificate: model('certificate'),
    auditEvent: model('auditEvent'),
    serialCounter: model('serialCounter'),
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { db: db as unknown as PrismaClient, tables, transaction: db.$transaction };
}

describe('parseSerial', () => {
  it('splits a serial into year and sequence', () => {
    expect(parseSerial('SYD-2026-000123', 'SYD')).toEqual({ year: 2026, sequence: 123 });
  });

  it.each(['PER-2026-000001', 'SYD-26-000001', 'SYD-2026-1', 'syd-2026-000001'])(
    'rejects %s for prefix SYD',
    (serial) => {
      expect(() => parseSerial(serial, 'SYD')).toThrow('is not SYD-YYYY-NNNNNN');
    },
  );
});

describe('serialCounters', () => {
  it('sets one counter per year at its highest sequence', () => {
    expect(serialCounters(SYDNEY)).toEqual([{ year: 2026, lastValue: 6 }]);
  });

  it('handles several years, sorted', () => {
    const profile = {
      ...SYDNEY,
      certificates: [
        { ...SYDNEY.certificates[0], serial: 'SYD-2027-000002' },
        { ...SYDNEY.certificates[1], serial: 'SYD-2026-000009' },
        { ...SYDNEY.certificates[2], serial: 'SYD-2027-000001' },
      ],
    };
    expect(serialCounters(profile)).toEqual([
      { year: 2026, lastValue: 9 },
      { year: 2027, lastValue: 2 },
    ]);
  });
});

describe('seed', () => {
  it('writes everything in one transaction', async () => {
    const { db, transaction } = fakeDb();
    await seed(db, SYDNEY);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('creates the profile rows in order and reports their ids', async () => {
    const { db, tables } = fakeDb();
    const result = await seed(db, SYDNEY);

    expect(result.adminId).toBe(1);
    expect(result.courses).toEqual({ 'FA-101': 1, 'WHS-201': 2, 'LDR-301': 3 });
    expect(result.participants['ana.oneil@example.com']).toBe(1);
    expect(result.certificates).toEqual({
      newYear: 1,
      revoked: 2,
      dstEndBefore: 3,
      dstEndAfter: 4,
      dstStartBefore: 5,
      dstStartAfter: 6,
    });
    expect(result.counts).toEqual({
      courses: 3,
      participants: 15,
      enrollments: 25,
      certificates: 6,
      auditEvents: 7,
    });
    expect(tables.serialCounter).toEqual([{ id: 1, year: 2026, lastValue: 6 }]);
  });

  it('copies names onto certificates and makes the revoked one revoked', async () => {
    const { db, tables } = fakeDb();
    await seed(db, SYDNEY);
    const [first, revoked] = tables.certificate;
    expect(first).toMatchObject({
      serial: 'SYD-2026-000001',
      participantName: "Ana O'Neil",
      courseTitle: 'First Aid Essentials',
      issuedAt: new Date('2025-12-31T13:30:00.000Z'),
      issuedById: 1,
    });
    expect(first).not.toHaveProperty('status');
    expect(revoked).toMatchObject({
      participantName: 'Bảo Nguyễn',
      status: 'revoked',
      revokedById: 1,
      revokeReason: 'Name misspelt on certificate',
    });
  });

  it('writes audit events in time order with who and what copied', async () => {
    const { db, tables } = fakeDb();
    await seed(db, SYDNEY);
    const events = tables.auditEvent;
    expect(events.map((e) => [e.action, e.serial])).toEqual([
      ['certificate.issued', 'SYD-2026-000001'],
      ['certificate.issued', 'SYD-2026-000002'],
      ['certificate.revoked', 'SYD-2026-000002'],
      ['certificate.issued', 'SYD-2026-000003'],
      ['certificate.issued', 'SYD-2026-000004'],
      ['certificate.issued', 'SYD-2026-000005'],
      ['certificate.issued', 'SYD-2026-000006'],
    ]);
    expect(events[2]).toMatchObject({
      actorId: 1,
      actorName: 'Administrator',
      certificateId: 2,
      participantName: 'Bảo Nguyễn',
      courseTitle: 'First Aid Essentials',
      details: { reason: 'Name misspelt on certificate' },
      occurredAt: new Date('2026-02-10T23:00:00.000Z'),
    });
    expect(events[0]).not.toHaveProperty('details');
  });

  it('stores completion only for completed enrollments', async () => {
    const { db, tables } = fakeDb();
    await seed(db, SYDNEY);
    for (const e of tables.enrollment) {
      expect(e.completedAt === null).toBe(e.status === 'enrolled');
    }
  });

  it('fails on a certificate for an enrollment the profile does not have', async () => {
    const broken: SeedProfile = {
      ...SYDNEY,
      // Bảo is not enrolled in Leading Teams.
      certificates: [
        { ...SYDNEY.certificates[0], participant: 'bao.nguyen@example.com', course: 'LDR-301' },
      ],
    };
    await expect(seed(fakeDb().db, broken)).rejects.toThrow(
      'seed: unknown enrollment bao.nguyen@example.com|LDR-301',
    );
  });

  it('fails on an enrollment for an unknown course', async () => {
    const broken: SeedProfile = {
      ...SYDNEY,
      enrollments: [{ ...SYDNEY.enrollments[0], course: 'NOPE' }],
    };
    await expect(seed(fakeDb().db, broken)).rejects.toThrow('seed: unknown course NOPE');
  });
});

describe('isSeeded', () => {
  it.each([
    [0, false],
    [1, true],
  ])('with %i admin rows → %s', async (count, expected) => {
    const db = { admin: { count: vi.fn().mockResolvedValue(count) } };
    await expect(isSeeded(db as unknown as PrismaClient)).resolves.toBe(expected);
  });
});
