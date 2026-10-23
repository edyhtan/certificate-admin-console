import type { PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { CertificateExportService } from './certificate-export.service.js';

function row(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    participantName: `Person ${id}`,
    courseTitle: 'First Aid Essentials',
    serial: `SYD-2026-${String(id).padStart(6, '0')}`,
    issuedAt: new Date('2026-04-04T14:30:00.000Z'),
    status: 'valid',
    ...overrides,
  };
}

function setup(batches: unknown[][], batchSize: number, now = new Date('2026-10-22T03:00:00Z')) {
  const findMany = vi.fn();
  for (const b of batches) findMany.mockResolvedValueOnce(b);
  findMany.mockResolvedValue([]);
  const service = new CertificateExportService(
    new FixedAppContext({
      db: { certificate: { findMany } } as unknown as PrismaClient,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
      now: () => now,
    }),
    batchSize,
  );
  return { service, findMany };
}

async function collect(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const c of gen) out += c;
  return out;
}

const query = { sort: 'issued_at', order: 'desc' } as const;

describe('CertificateExportService', () => {
  it('names the file after the tenant code and today’s local date', () => {
    // 15:00 UTC on 22 Oct is already 23 Oct in Sydney.
    const { service } = setup([], 10, new Date('2026-10-22T15:00:00Z'));
    expect(service.filename()).toBe('certificates-SYD-2026-10-23.csv');
  });

  it('starts with the BOM and the header row', async () => {
    const { service } = setup([], 10);
    expect(await collect(service.chunks(query))).toBe(
      '﻿learner_name,course_title,serial_number,issue_date,status\r\n',
    );
  });

  it('writes the tenant-local issue date, not the UTC one', async () => {
    const { service } = setup(
      [[row(1, { participantName: "Ana O'Neil", issuedAt: new Date('2025-12-31T13:30:00Z') })]],
      10,
    );
    const lines = (await collect(service.chunks(query))).split('\r\n');
    expect(lines[1]).toBe("Ana O'Neil,First Aid Essentials,SYD-2026-000001,2026-01-01,valid");
  });

  it('reads keyset batches: cursor on the last id, skip 1, same where and orderBy', async () => {
    const { service, findMany } = setup([[row(9), row(8)], [row(7), row(6)], [row(5)]], 2);
    const out = await collect(service.chunks({ ...query, status: 'valid' }));
    expect(out.split('\r\n').filter(Boolean)).toHaveLength(1 + 5);
    expect(findMany).toHaveBeenCalledTimes(3);
    const calls = findMany.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({
      where: { status: 'valid' },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });
    expect(calls[0]).not.toHaveProperty('cursor');
    expect(calls[1]).toMatchObject({ cursor: { id: 8 }, skip: 1, take: 2 });
    expect(calls[2]).toMatchObject({ cursor: { id: 6 }, skip: 1 });
  });

  it('asks once more after a full last batch, then stops on an empty one', async () => {
    const { service, findMany } = setup([[row(2), row(1)]], 2);
    await collect(service.chunks(query));
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('escapes cells from the data', async () => {
    const { service } = setup([[row(1, { participantName: '=cmd|calc', courseTitle: 'Safety, "Basics"' })]], 10);
    const lines = (await collect(service.chunks(query))).split('\r\n');
    expect(lines[1]).toBe(`'=cmd|calc,"Safety, ""Basics""",SYD-2026-000001,2026-04-05,valid`);
  });
});
