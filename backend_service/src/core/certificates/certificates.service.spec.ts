import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';
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
  const service = new CertificatesService(
    new FixedAppContext({
      db,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
    }),
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
