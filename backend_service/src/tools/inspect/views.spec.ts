import type { CertificateDetail, TenantSummary } from './queries.js';
import type { DiscoveredTenant } from './tenants.js';
import {
  renderCertificateDetail,
  renderCertificates,
  renderCourses,
  renderSummary,
  renderTenants,
  tenantLabel,
} from './views.js';

const SYD: DiscoveredTenant = {
  code: 'SYD',
  name: 'Sydney',
  timeZone: 'Australia/Sydney',
  known: true,
  database: 'cert_syd',
};

describe('renderTenants', () => {
  it('lists each tenant with its zone and database', () => {
    const out = renderTenants([SYD], '127.0.0.1:3307');
    expect(out).toContain('SYD');
    expect(out).toContain('Australia/Sydney');
    expect(out).toContain('cert_syd');
  });

  it('explains how to get data when there are no tenant databases', () => {
    expect(renderTenants([], '127.0.0.1:3307')).toMatch(
      /No tenant databases .* on 127\.0\.0\.1:3307[\s\S]*db:setup/,
    );
  });

  it('flags an unknown code as shown in UTC', () => {
    const mel = { ...SYD, code: 'MEL', name: 'MEL', timeZone: 'UTC', known: false, database: 'cert_mel' };
    expect(renderTenants([mel], 'x')).toContain('UTC (unknown code)');
    expect(tenantLabel(mel)).toContain('dates shown in UTC');
  });
});

describe('renderSummary', () => {
  const summary: TenantSummary = {
    admins: 1,
    courses: 3,
    participants: 15,
    enrollments: 25,
    completedEnrollments: 19,
    eligible: 13,
    validCertificates: 5,
    revokedCertificates: 1,
    auditEvents: 7,
    serialCounters: [{ year: 2026, lastValue: 6 }],
    lastIssuedAt: new Date('2026-10-03T16:30:00Z'),
  };

  it('shows the counts and the last issue in tenant time', () => {
    const out = renderSummary(SYD, summary);
    expect(out).toMatch(/Enrollments\s+25 \(19 completed\)/);
    expect(out).toMatch(/Eligible for bulk issue\s+13/);
    expect(out).toMatch(/Certificates\s+5 valid, 1 revoked/);
    expect(out).toMatch(/Serial counters\s+2026: 6/);
    expect(out).toMatch(/Last issued\s+2026-10-04 03:30 AEDT/);
  });

  it('copes with an empty tenant', () => {
    const out = renderSummary(SYD, { ...summary, serialCounters: [], lastIssuedAt: null });
    expect(out).toMatch(/Serial counters\s+none/);
    expect(out).toMatch(/Last issued\s+—/);
  });
});

describe('renderCourses', () => {
  it('shows the counts per course, or a message when there are none', () => {
    const out = renderCourses([
      {
        id: 1,
        code: 'FA-101',
        title: 'First Aid Essentials',
        enrolled: 2,
        completed: 8,
        eligible: 5,
        validCertificates: 2,
        revokedCertificates: 1,
      },
    ]);
    expect(out.split('\n')[2]).toMatch(/^FA-101\s+First Aid Essentials\s+2\s+8\s+5\s+2\s+1$/);
    expect(renderCourses([])).toBe('(no courses)');
  });
});

describe('renderCertificates', () => {
  it('shows the filter, rows in tenant time and the page', () => {
    const out = renderCertificates(
      {
        items: [
          {
            id: 1,
            serial: 'SYD-2026-000001',
            participantName: 'Ana O’Neil',
            courseTitle: 'First Aid Essentials',
            status: 'valid',
            issuedAt: new Date('2025-12-31T13:30:00Z'),
          },
        ],
        page: 1,
        pageSize: 15,
        total: 1,
      },
      'Australia/Sydney',
      'Filter: search "ana"',
    );
    expect(out).toContain('Filter: search "ana"');
    expect(out).toContain('2026-01-01 00:30 AEDT');
    expect(out).toContain('Page 1 of 1 (1 row)');
  });

  it('says when nothing matches', () => {
    expect(
      renderCertificates({ items: [], page: 1, pageSize: 15, total: 0 }, 'Australia/Sydney'),
    ).toContain('(no certificates match)');
  });
});

describe('renderCertificateDetail', () => {
  const base: CertificateDetail = {
    id: 2,
    serial: 'SYD-2026-000002',
    status: 'valid',
    participantId: 2,
    participantName: 'Bảo Nguyễn',
    courseCode: 'FA-101',
    courseTitle: 'First Aid Essentials',
    enrollmentId: 2,
    issuedAt: new Date('2026-02-09T22:00:00Z'),
    issuedBy: 'Administrator',
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    auditEvents: [],
  };

  it('shows local and UTC issue times and no revoke fields when valid', () => {
    const out = renderCertificateDetail(base, 'Australia/Sydney');
    expect(out).toMatch(/Issued\s+2026-02-10 09:00 AEDT/);
    expect(out).toMatch(/Issued \(UTC\)\s+2026-02-09T22:00:00.000Z/);
    expect(out).not.toContain('Revoked by');
    expect(out).toContain('(no audit events)');
  });

  it('shows who revoked it, when and why', () => {
    const out = renderCertificateDetail(
      {
        ...base,
        status: 'revoked',
        revokedAt: new Date('2026-02-10T23:00:00Z'),
        revokedBy: 'Administrator',
        revokeReason: 'Name misspelt on certificate',
      },
      'Australia/Sydney',
    );
    expect(out).toMatch(/Revoked\s+2026-02-11 10:00 AEDT/);
    expect(out).toMatch(/Reason\s+Name misspelt on certificate/);
  });
});
