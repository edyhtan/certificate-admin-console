import { certificateDetailSchema, certificateSummarySchema } from '@cert/shared';
import { toDetail, toSummary, type DetailRow } from './certificate.mapper.js';

const row: DetailRow = {
  id: 2,
  serial: 'SYD-2026-000002',
  participantId: 2,
  participantName: 'Bảo Nguyễn',
  courseId: 1,
  courseTitle: 'First Aid Essentials',
  status: 'revoked',
  issuedAt: new Date('2026-02-09T22:00:00.000Z'),
  revokedAt: new Date('2026-02-10T23:00:00.000Z'),
  enrollmentId: 2,
  revokeReason: 'Name misspelt on certificate',
  issuedBy: { id: 1, name: 'Administrator' },
  revokedBy: { id: 1, name: 'Administrator' },
};

describe('certificate mapper', () => {
  it('maps a list row with UTC ISO instants, matching the contract', () => {
    const summary = toSummary(row);
    expect(summary).toEqual({
      id: 2,
      serial: 'SYD-2026-000002',
      participantId: 2,
      participantName: 'Bảo Nguyễn',
      courseId: 1,
      courseTitle: 'First Aid Essentials',
      status: 'revoked',
      issuedAt: '2026-02-09T22:00:00.000Z',
      revokedAt: '2026-02-10T23:00:00.000Z',
    });
    expect(certificateSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('gives a valid certificate a null revokedAt', () => {
    expect(toSummary({ ...row, status: 'valid', revokedAt: null }).revokedAt).toBeNull();
  });

  it('maps a detail with actors, reason and the tenant timezone', () => {
    const detail = toDetail(row, 'Australia/Sydney');
    expect(detail).toMatchObject({
      enrollmentId: 2,
      issuedBy: { id: 1, name: 'Administrator' },
      revokedBy: { id: 1, name: 'Administrator' },
      revokeReason: 'Name misspelt on certificate',
      timezone: 'Australia/Sydney',
    });
    expect(certificateDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('keeps revokedBy and reason null for a valid certificate', () => {
    const detail = toDetail(
      { ...row, status: 'valid', revokedAt: null, revokedBy: null, revokeReason: null },
      'Australia/Sydney',
    );
    expect(detail).toMatchObject({ revokedBy: null, revokeReason: null, revokedAt: null });
    expect(certificateDetailSchema.safeParse(detail).success).toBe(true);
  });
});
