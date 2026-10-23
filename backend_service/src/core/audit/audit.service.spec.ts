import type { Prisma, PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { AuditService, type AuditedCertificate } from './audit.service.js';

const NOW = new Date('2026-10-22T03:00:00.000Z');

const certificate: AuditedCertificate = {
  id: 9,
  serial: 'SYD-2026-000009',
  participantId: 2,
  participantName: 'Bảo Nguyễn',
  courseId: 1,
  courseTitle: 'First Aid Essentials',
};

function setup() {
  const db = {
    auditEvent: {
      create: vi.fn(() => {
        throw new Error('must write through the transaction, not the client');
      }),
    },
  };
  const tx = { auditEvent: { create: vi.fn().mockResolvedValue({}) } };
  const service = new AuditService(
    new FixedAppContext({
      db: db as unknown as PrismaClient,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
      now: () => NOW,
    }),
  );
  return { service, tx, db };
}

describe('AuditService.record', () => {
  it('writes through the transaction it is given, never the plain client', async () => {
    const { service, tx, db } = setup();
    await service.record(tx as unknown as Prisma.TransactionClient, {
      action: 'certificate.revoked',
      certificate,
    });
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
    expect(db.auditEvent.create).not.toHaveBeenCalled();
  });

  it('copies actor, time, course, participant and serial onto the event', async () => {
    const { service, tx } = setup();
    await service.record(tx as unknown as Prisma.TransactionClient, {
      action: 'certificate.revoked',
      certificate,
      details: { reason: 'Name misspelt' },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: {
        action: 'certificate.revoked',
        occurredAt: NOW,
        actorId: 1,
        actorName: 'Administrator',
        courseId: 1,
        courseTitle: 'First Aid Essentials',
        participantId: 2,
        participantName: 'Bảo Nguyễn',
        certificateId: 9,
        serial: 'SYD-2026-000009',
        details: { reason: 'Name misspelt' },
      },
    });
  });

  it('leaves details out when there are none', async () => {
    const { service, tx } = setup();
    await service.record(tx as unknown as Prisma.TransactionClient, {
      action: 'certificate.issued',
      certificate,
    });
    expect(tx.auditEvent.create.mock.calls[0][0].data).not.toHaveProperty('details');
  });

  it('passes a failed write up, so the caller’s transaction rolls back', async () => {
    const { service, tx } = setup();
    tx.auditEvent.create.mockRejectedValue(new Error('lock wait timeout'));
    await expect(
      service.record(tx as unknown as Prisma.TransactionClient, {
        action: 'certificate.revoked',
        certificate,
      }),
    ).rejects.toThrow('lock wait timeout');
  });
});
