import type { IssuanceEvent } from '@cert/shared';
import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/audit.service.js';
import { FixedAppContext } from '../context/fixed-app-context.js';
import type { SerialService } from '../serials/serial.js';
import { IssuanceService, type PreparedRun } from './issuance.service.js';

const NOW = new Date('2026-10-22T03:00:00.000Z');

function prismaError(code: string, target?: unknown) {
  return Object.assign(new Error(`prisma ${code}`), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta: { target },
  });
}

function setup() {
  const tx = {
    certificate: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 100, ...data })),
    },
  };
  const db = {
    course: { findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'First Aid Essentials' }) },
    enrollment: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
    ),
  };
  let n = 6;
  const serials = { next: vi.fn(async () => `SYD-2026-${String(++n).padStart(6, '0')}`) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new IssuanceService(
    new FixedAppContext({
      db: db as unknown as PrismaClient,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
      now: () => NOW,
    }),
    serials as unknown as SerialService,
    audit as unknown as AuditService,
  );
  return { service, db, tx, serials, audit };
}

const run: PreparedRun = {
  course: { id: 1, title: 'First Aid Essentials' },
  candidates: [
    { enrollmentId: 4, participantId: 4, participantName: "Liam O'Connor" },
    { enrollmentId: 5, participantId: 5, participantName: 'Zoë Müller' },
  ],
};

async function collect(gen: AsyncGenerator<IssuanceEvent>) {
  const out: IssuanceEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('IssuanceService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('preview', () => {
    it('counts completed and already issued, and works out eligible', async () => {
      const { service, db } = setup();
      db.enrollment.count.mockResolvedValueOnce(8).mockResolvedValueOnce(3);
      await expect(service.preview(1)).resolves.toEqual({
        courseId: 1,
        completed: 8,
        alreadyIssued: 3,
        eligible: 5,
      });
      expect(db.enrollment.count).toHaveBeenNthCalledWith(1, {
        where: { courseId: 1, status: 'completed' },
      });
      expect(db.enrollment.count).toHaveBeenNthCalledWith(2, {
        where: { courseId: 1, status: 'completed', certificate: { isNot: null } },
      });
    });

    it('throws not found for an unknown course', async () => {
      const { service, db } = setup();
      db.course.findUnique.mockResolvedValue(null);
      await expect(service.preview(9)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('prepare', () => {
    it('loads completed enrollments in id order with full names', async () => {
      const { service, db } = setup();
      db.enrollment.findMany.mockResolvedValue([
        { id: 4, participant: { id: 4, firstName: 'Liam', lastName: "O'Connor" } },
      ]);
      await expect(service.prepare(1)).resolves.toEqual({
        course: { id: 1, title: 'First Aid Essentials' },
        candidates: [{ enrollmentId: 4, participantId: 4, participantName: "Liam O'Connor" }],
      });
      expect(db.enrollment.findMany.mock.calls[0][0]).toMatchObject({
        where: { courseId: 1, status: 'completed' },
        orderBy: { id: 'asc' },
      });
    });

    it('throws not found for an unknown course, before anything streams', async () => {
      const { service, db } = setup();
      db.course.findUnique.mockResolvedValue(null);
      await expect(service.prepare(9)).rejects.toThrow('Course not found');
      expect(db.enrollment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('yields start, one result per candidate, then done', async () => {
      const { service } = setup();
      expect(await collect(service.run(run))).toEqual([
        { type: 'start', total: 2 },
        { type: 'result', enrollmentId: 4, participantName: "Liam O'Connor", outcome: 'issued', serial: 'SYD-2026-000007' },
        { type: 'result', enrollmentId: 5, participantName: 'Zoë Müller', outcome: 'issued', serial: 'SYD-2026-000008' },
        { type: 'done', issued: 2, skipped: 0, failed: 0 },
      ]);
    });

    it('writes serial, certificate and audit event in the same transaction', async () => {
      const { service, tx, serials, audit } = setup();
      await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(serials.next).toHaveBeenCalledWith(tx, NOW);
      expect(tx.certificate.create.mock.calls[0][0].data).toEqual({
        enrollmentId: 4,
        participantId: 4,
        courseId: 1,
        serial: 'SYD-2026-000007',
        participantName: "Liam O'Connor",
        courseTitle: 'First Aid Essentials',
        issuedAt: NOW,
        issuedById: 1,
      });
      expect(audit.record).toHaveBeenCalledWith(tx, {
        action: 'certificate.issued',
        certificate: expect.objectContaining({ id: 100, serial: 'SYD-2026-000007' }),
      });
    });

    it.each([
      ['valid', 'already_issued'],
      ['revoked', 'revoked'],
    ])('skips an existing %s certificate as %s, using no serial and no audit', async (status, reason) => {
      const { service, tx, serials, audit } = setup();
      tx.certificate.findUnique.mockResolvedValue({ status });
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'skipped', reason });
      expect(events.at(-1)).toEqual({ type: 'done', issued: 0, skipped: 1, failed: 0 });
      expect(serials.next).not.toHaveBeenCalled();
      expect(tx.certificate.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('skips as already_issued when a parallel run inserted it first (P2002 on enrollment)', async () => {
      const { service, tx } = setup();
      tx.certificate.create.mockRejectedValueOnce(prismaError('P2002', 'certificate_enrollment_key'));
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'skipped', reason: 'already_issued' });
    });

    it('reports failed with a safe message, and carries on with the next learner', async () => {
      const { service, tx } = setup();
      tx.certificate.create.mockRejectedValueOnce(new Error('ER_SIGNAL_EXCEPTION: secret detail'));
      const events = await collect(service.run(run));
      expect(events[1]).toEqual({
        type: 'result',
        enrollmentId: 4,
        participantName: "Liam O'Connor",
        outcome: 'failed',
        message: 'Unexpected error',
      });
      expect(events[2]).toMatchObject({ outcome: 'issued' });
      expect(events.at(-1)).toEqual({ type: 'done', issued: 1, skipped: 0, failed: 1 });
    });

    it('names the database error code but not its details', async () => {
      const { service, tx } = setup();
      tx.certificate.create.mockRejectedValueOnce(prismaError('P2003'));
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'failed', message: 'Database error (P2003)' });
    });

    it('does not treat a clash on another unique key as already issued', async () => {
      const { service, tx } = setup();
      tx.certificate.create.mockRejectedValueOnce(prismaError('P2002', 'certificate_serial_key'));
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'failed', message: 'Database error (P2002)' });
    });

    it('retries a deadlock (P2034) and issues on a later attempt', async () => {
      const { service, tx } = setup();
      tx.certificate.create
        .mockRejectedValueOnce(prismaError('P2034'))
        .mockRejectedValueOnce(prismaError('P2034'));
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'issued' });
      expect(tx.certificate.create).toHaveBeenCalledTimes(3);
    });

    it('gives up after three deadlocks', async () => {
      const { service, tx } = setup();
      tx.certificate.create.mockRejectedValue(prismaError('P2034'));
      const events = await collect(service.run({ ...run, candidates: [run.candidates[0]] }));
      expect(events[1]).toMatchObject({ outcome: 'failed', message: 'Database error (P2034)' });
      expect(tx.certificate.create).toHaveBeenCalledTimes(3);
    });

    it('yields start 0 and done 0 for a course with no candidates', async () => {
      const { service } = setup();
      expect(await collect(service.run({ ...run, candidates: [] }))).toEqual([
        { type: 'start', total: 0 },
        { type: 'done', issued: 0, skipped: 0, failed: 0 },
      ]);
    });
  });
});
