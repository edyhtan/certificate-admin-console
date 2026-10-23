import { SYDNEY_SEED } from './manifest.js';

// Expected values are written out by hand, so a change to the profile or to the
// manifest logic shows up here.
describe('SYDNEY_SEED', () => {
  it('describes the Sydney tenant and its admin', () => {
    expect(SYDNEY_SEED).toMatchObject({
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      admin: { id: 1, username: 'admin', name: 'Administrator' },
    });
  });

  it('has the expected counts', () => {
    expect(SYDNEY_SEED.counts).toEqual({
      admins: 1,
      courses: 3,
      participants: 15,
      enrollments: 25,
      completedEnrollments: 19,
      certificates: 6,
      revokedCertificates: 1,
      auditEvents: 7,
    });
  });

  it('knows course ids and how many learners each course can still issue to', () => {
    expect(SYDNEY_SEED.courseIds).toEqual({ 'FA-101': 1, 'WHS-201': 2, 'LDR-301': 3 });
    expect(SYDNEY_SEED.eligibleByCourse).toEqual({
      'FA-101': 5,
      'WHS-201': 5,
      'LDR-301': 3,
    });
  });

  it('lists the edge-case certificates with UTC instants', () => {
    expect(SYDNEY_SEED.certificates.newYear).toEqual({
      id: 1,
      serial: 'SYD-2026-000001',
      participantName: "Ana O'Neil",
      courseCode: 'FA-101',
      courseTitle: 'First Aid Essentials',
      issuedAt: '2025-12-31T13:30:00.000Z',
      revokedAt: null,
      revokeReason: null,
    });
    expect(SYDNEY_SEED.certificates.dstEndBefore.issuedAt).toBe('2026-04-04T14:30:00.000Z');
    expect(SYDNEY_SEED.certificates.dstEndAfter.issuedAt).toBe('2026-04-04T17:30:00.000Z');
    expect(SYDNEY_SEED.certificates.dstStartBefore.issuedAt).toBe('2026-10-03T15:30:00.000Z');
    expect(SYDNEY_SEED.certificates.dstStartAfter.issuedAt).toBe('2026-10-03T16:30:00.000Z');
  });

  it('lists the revoked certificate with when and why', () => {
    expect(SYDNEY_SEED.certificates.revoked).toMatchObject({
      id: 2,
      serial: 'SYD-2026-000002',
      participantName: 'Bảo Nguyễn',
      revokedAt: '2026-02-10T23:00:00.000Z',
      revokeReason: 'Name misspelt on certificate',
    });
  });
});
