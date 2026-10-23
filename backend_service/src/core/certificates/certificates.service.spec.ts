import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/audit.service.js';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { DETAIL_SELECT, SUMMARY_SELECT } from './certificate.mapper.js';
import { CertificatesService } from './certificates.service.js';

const listRow = {
  id: 6,
  serial: 'SYD-2026-000006',
  participantId: 11,
  participantName: 'Oliver Smith',
  courseId: 3,
  courseTitle: 'Leading Teams',
  status: 'valid' as const,
  issuedAt: new Date('2026-10-03T16:30:00.000Z'),
  revokedAt: null,
};

function setup() {
  const certificate = {
    findMany: vi.fn().mockReturnValue('findMany-query'),
    count: vi.fn().mockReturnValue('count-query'),
    findUnique: vi.fn(),
  };
  const $transaction = vi.fn().mockResolvedValue([[listRow], 6]);
  const db = { certificate, $transaction } as unknown as PrismaClient;
  const audit = { record: vi.fn() };
  const service = new CertificatesService(
    new FixedAppContext({
      db,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
    }),
    audit as unknown as AuditService,
  );
  return { service, certificate, $transaction };
}

describe('CertificatesService.list', () => {
  it('reads one page, newest first with id as tie-breaker', async () => {
    const { service, certificate } = setup();
    await service.list({ page: 3, pageSize: 20 });
    expect(certificate.findMany).toHaveBeenCalledWith({
      select: SUMMARY_SELECT,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      skip: 40,
      take: 20,
    });
  });

  it('reads rows and total in one transaction', async () => {
    const { service, $transaction } = setup();
    await service.list({ page: 1, pageSize: 20 });
    expect($transaction).toHaveBeenCalledWith(['findMany-query', 'count-query']);
  });

  it('answers in the contract shape with the tenant timezone', async () => {
    const { service } = setup();
    await expect(service.list({ page: 1, pageSize: 5 })).resolves.toEqual({
      items: [{ ...listRow, issuedAt: '2026-10-03T16:30:00.000Z', revokedAt: null }],
      page: 1,
      pageSize: 5,
      total: 6,
      timezone: 'Australia/Sydney',
    });
  });
});

describe('CertificatesService.get', () => {
  it('reads one certificate with its detail fields', async () => {
    const { service, certificate } = setup();
    certificate.findUnique.mockResolvedValue({
      ...listRow,
      enrollmentId: 20,
      revokeReason: null,
      issuedBy: { id: 1, name: 'Administrator' },
      revokedBy: null,
    });
    const detail = await service.get(6);
    expect(certificate.findUnique).toHaveBeenCalledWith({
      where: { id: 6 },
      select: DETAIL_SELECT,
    });
    expect(detail).toMatchObject({
      id: 6,
      enrollmentId: 20,
      issuedBy: { id: 1, name: 'Administrator' },
      timezone: 'Australia/Sydney',
    });
  });

  it('throws not found for an unknown id', async () => {
    const { service, certificate } = setup();
    certificate.findUnique.mockResolvedValue(null);
    const error = await service.get(999).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toBe('Certificate not found');
  });
});

const NOW = new Date('2026-10-22T03:00:00.000Z');

const revokedRow = {
  id: 1,
  serial: 'SYD-2026-000001',
  participantId: 1,
  participantName: "Ana O'Neil",
  courseId: 1,
  courseTitle: 'First Aid Essentials',
  status: 'revoked' as const,
  issuedAt: new Date('2025-12-31T13:30:00.000Z'),
  revokedAt: NOW,
  enrollmentId: 1,
  revokeReason: 'Wrong course',
  issuedBy: { id: 1, name: 'Administrator' },
  revokedBy: { id: 1, name: 'Administrator' },
};

/** `updated` = rows the conditional update changed; `current` = what the read returns. */
function setupRevoke(updated: number, current: unknown) {
  const tx = {
    certificate: {
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
      findUnique: vi.fn().mockResolvedValue(current),
    },
  };
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaClient;
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new CertificatesService(
    new FixedAppContext({
      db,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
      now: () => NOW,
    }),
    audit as unknown as AuditService,
  );
  return { service, tx, audit };
}

describe('CertificatesService.revoke', () => {
  it('revokes only a valid certificate, with actor, time and reason', async () => {
    const { service, tx } = setupRevoke(1, revokedRow);
    await service.revoke(1, { reason: 'Wrong course' });
    expect(tx.certificate.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: 'valid' },
      data: {
        status: 'revoked',
        revokedAt: NOW,
        revokedById: 1,
        revokeReason: 'Wrong course',
      },
    });
  });

  it('writes the audit event in the same transaction, with the reason', async () => {
    const { service, tx, audit } = setupRevoke(1, revokedRow);
    await service.revoke(1, { reason: 'Wrong course' });
    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(tx, {
      action: 'certificate.revoked',
      certificate: revokedRow,
      details: { reason: 'Wrong course' },
    });
  });

  it('writes no details when there is no reason', async () => {
    const { service, tx, audit } = setupRevoke(1, { ...revokedRow, revokeReason: null });
    await service.revoke(1, {});
    expect(tx.certificate.updateMany.mock.calls[0][0].data.revokeReason).toBeNull();
    expect(audit.record.mock.calls[0][1]).not.toHaveProperty('details');
  });

  it('returns the detail after the change', async () => {
    const { service } = setupRevoke(1, revokedRow);
    await expect(service.revoke(1, { reason: 'Wrong course' })).resolves.toMatchObject({
      id: 1,
      status: 'revoked',
      revokedAt: '2026-10-22T03:00:00.000Z',
      revokedBy: { id: 1, name: 'Administrator' },
      revokeReason: 'Wrong course',
      timezone: 'Australia/Sydney',
    });
  });

  it('returns an already revoked certificate as it is, without an audit event', async () => {
    const earlier = {
      ...revokedRow,
      revokedAt: new Date('2026-02-10T23:00:00.000Z'),
      revokeReason: 'First reason',
    };
    const { service, audit } = setupRevoke(0, earlier);
    await expect(service.revoke(1, { reason: 'Second reason' })).resolves.toMatchObject({
      revokedAt: '2026-02-10T23:00:00.000Z',
      revokeReason: 'First reason',
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws not found for an unknown id, without an audit event', async () => {
    const { service, tx, audit } = setupRevoke(0, null);
    await expect(service.revoke(999, {})).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.certificate.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
      select: DETAIL_SELECT,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('fails before touching the database when there is no actor', async () => {
    const { tx, audit } = setupRevoke(1, revokedRow);
    const noActor = new CertificatesService(
      {
        get db(): never {
          throw new Error('db should not be used');
        },
        get actor(): never {
          throw new Error('no "admin" row loaded');
        },
        timeZone: 'Australia/Sydney',
        serialPrefix: 'SYD',
        now: () => NOW,
      } as unknown as FixedAppContext,
      audit as unknown as AuditService,
    );
    await expect(noActor.revoke(1, {})).rejects.toThrow('no "admin" row loaded');
    expect(tx.certificate.updateMany).not.toHaveBeenCalled();
  });
});
