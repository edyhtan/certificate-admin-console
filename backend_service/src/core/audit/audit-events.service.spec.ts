import { auditEventSchema } from '@cert/shared';
import type { PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { AuditEventsService, toAuditEvent } from './audit-events.service.js';

const row = {
  id: 3,
  occurredAt: new Date('2026-02-10T23:00:00.000Z'),
  action: 'certificate.revoked',
  actorId: 1,
  actorName: 'Administrator',
  courseId: 1,
  courseTitle: 'First Aid Essentials',
  participantId: 2,
  participantName: 'Bảo Nguyễn',
  certificateId: 2,
  serial: 'SYD-2026-000002',
  details: { reason: 'Name misspelt on certificate' },
};

describe('toAuditEvent', () => {
  it('maps a row to the contract shape with a nested actor and UTC instant', () => {
    const event = toAuditEvent(row);
    expect(event).toEqual({
      id: 3,
      occurredAt: '2026-02-10T23:00:00.000Z',
      action: 'certificate.revoked',
      actor: { id: 1, name: 'Administrator' },
      courseId: 1,
      courseTitle: 'First Aid Essentials',
      participantId: 2,
      participantName: 'Bảo Nguyễn',
      certificateId: 2,
      serial: 'SYD-2026-000002',
      details: { reason: 'Name misspelt on certificate' },
    });
    expect(auditEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([null, 'text', 42, ['a']])('gives details %j as null', (details) => {
    expect(toAuditEvent({ ...row, details }).details).toBeNull();
  });
});

describe('AuditEventsService.list', () => {
  function setup() {
    const auditEvent = {
      findMany: vi.fn().mockReturnValue('findMany-query'),
      count: vi.fn().mockReturnValue('count-query'),
    };
    const $transaction = vi.fn().mockResolvedValue([[row], 7]);
    const service = new AuditEventsService(
      new FixedAppContext({
        db: { auditEvent, $transaction } as unknown as PrismaClient,
        timeZone: 'Australia/Sydney',
        serialPrefix: 'SYD',
        actor: { id: 1, name: 'Administrator' },
      }),
    );
    return { service, auditEvent, $transaction };
  }

  it('reads one page newest first, with id as tie-breaker, in one transaction', async () => {
    const { service, auditEvent, $transaction } = setup();
    const res = await service.list({ page: 2, pageSize: 5 });
    expect(auditEvent.findMany.mock.calls[0][0]).toMatchObject({
      where: {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    });
    expect($transaction).toHaveBeenCalledWith(['findMany-query', 'count-query']);
    expect(res).toMatchObject({ page: 2, pageSize: 5, total: 7, timezone: 'Australia/Sydney' });
    expect(res.items).toHaveLength(1);
  });

  it('applies every filter to both the rows and the total', async () => {
    const { service, auditEvent } = setup();
    await service.list({
      page: 1,
      pageSize: 20,
      certificateId: 2,
      courseId: 1,
      action: 'certificate.revoked',
    });
    const where = { certificateId: 2, courseId: 1, action: 'certificate.revoked' };
    expect(auditEvent.findMany.mock.calls[0][0].where).toEqual(where);
    expect(auditEvent.count).toHaveBeenCalledWith({ where });
  });
});
