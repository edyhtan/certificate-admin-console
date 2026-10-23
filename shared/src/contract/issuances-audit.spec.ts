import {
  auditEventListQuerySchema,
  auditEventSchema,
} from './audit-events.js';
import {
  issuanceEventSchema,
  issuancePreviewQuerySchema,
  issueCertificatesRequestSchema,
} from './issuances.js';

describe('issuance requests', () => {
  it('coerces the preview courseId from the query string', () => {
    expect(issuancePreviewQuerySchema.parse({ courseId: '4' })).toEqual({
      courseId: 4,
    });
  });

  it('requires a positive courseId', () => {
    expect(issuancePreviewQuerySchema.safeParse({}).success).toBe(false);
    expect(issueCertificatesRequestSchema.safeParse({ courseId: 0 }).success).toBe(
      false,
    );
    expect(issueCertificatesRequestSchema.parse({ courseId: 4 })).toEqual({
      courseId: 4,
    });
  });
});

describe('issuanceEventSchema (NDJSON lines)', () => {
  // The example stream from spec §5.2.
  const lines = [
    '{"type":"start","total":14}',
    `{"type":"result","enrollmentId":7,"participantName":"Ana O'Neil","outcome":"issued","serial":"SYD-2026-000018"}`,
    '{"type":"result","enrollmentId":8,"participantName":"Bao Nguyễn","outcome":"skipped","reason":"already_issued"}',
    '{"type":"result","enrollmentId":9,"participantName":"Cy","outcome":"failed","message":"Lock wait timeout"}',
    '{"type":"done","issued":11,"skipped":2,"failed":1}',
  ];

  it('parses every line of the spec example', () => {
    const events = lines.map((l) => issuanceEventSchema.parse(JSON.parse(l)));
    expect(events.map((e) => e.type)).toEqual([
      'start',
      'result',
      'result',
      'result',
      'done',
    ]);
  });

  it('narrows a result by outcome', () => {
    const event = issuanceEventSchema.parse(JSON.parse(lines[1]));
    if (event.type !== 'result' || event.outcome !== 'issued') {
      throw new Error('expected an issued result');
    }
    expect(event.serial).toBe('SYD-2026-000018');
  });

  it('rejects an issued result without a serial', () => {
    expect(
      issuanceEventSchema.safeParse({
        type: 'result',
        enrollmentId: 1,
        participantName: 'A',
        outcome: 'issued',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown skip reason and an unknown event type', () => {
    expect(
      issuanceEventSchema.safeParse({
        type: 'result',
        enrollmentId: 1,
        participantName: 'A',
        outcome: 'skipped',
        reason: 'busy',
      }).success,
    ).toBe(false);
    expect(issuanceEventSchema.safeParse({ type: 'progress' }).success).toBe(false);
  });
});

describe('audit events', () => {
  it('defaults paging and coerces filters', () => {
    expect(
      auditEventListQuerySchema.parse({
        certificateId: '5',
        action: 'certificate.revoked',
      }),
    ).toEqual({
      certificateId: 5,
      action: 'certificate.revoked',
      page: 1,
      pageSize: 20,
    });
  });

  it('rejects an unknown action', () => {
    const result = auditEventListQuerySchema.safeParse({ action: 'certificate.deleted' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must be one of certificate.issued, certificate.revoked',
    );
  });

  it('accepts an event with copied who/what and revoke details', () => {
    expect(
      auditEventSchema.safeParse({
        id: 1,
        occurredAt: '2026-04-05T02:30:00.000Z',
        action: 'certificate.revoked',
        actor: { id: 1, name: 'Administrator' },
        courseId: 3,
        courseTitle: 'First Aid',
        participantId: 2,
        participantName: "Ana O'Neil",
        certificateId: 9,
        serial: 'SYD-2026-000001',
        details: { reason: 'Name misspelt' },
      }).success,
    ).toBe(true);
  });
});
