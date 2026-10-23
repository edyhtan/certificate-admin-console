/** One render function per screen. Pure: query results in, text out. */
import {
  formatInstant,
  pageLabel,
  renderFields,
  renderTable,
} from './format.js';
import type {
  AuditRow,
  CertificateDetail,
  CertificateRow,
  CourseDetail,
  CourseRow,
  EnrollmentRow,
  Page,
  ParticipantDetail,
  ParticipantRow,
  TenantSummary,
} from './queries.js';
import type { DiscoveredTenant } from './tenants.js';

export function tenantLabel(t: DiscoveredTenant): string {
  const zone = t.known ? t.timeZone : 'UTC — unknown tenant code, dates shown in UTC';
  return `${t.code} · ${t.name} · ${zone} · database ${t.database}`;
}

export function renderTenants(
  tenants: readonly DiscoveredTenant[],
  server: string,
): string {
  if (tenants.length === 0) {
    return `No tenant databases (cert_xxx) on ${server}.\nStart MySQL and seed it with \`npm run dev\` or \`npm run db:setup\`.`;
  }
  return renderTable(
    [
      { header: 'Code', value: (t) => t.code },
      { header: 'Name', value: (t) => t.name },
      { header: 'Timezone', value: (t) => (t.known ? t.timeZone : 'UTC (unknown code)') },
      { header: 'Database', value: (t) => t.database },
    ],
    tenants,
  );
}

export function renderSummary(
  t: DiscoveredTenant,
  s: TenantSummary,
): string {
  const counters =
    s.serialCounters.length === 0
      ? 'none'
      : s.serialCounters.map((c) => `${c.year}: ${c.lastValue}`).join(', ');
  return [
    tenantLabel(t),
    '',
    renderFields([
      ['Admins', s.admins],
      ['Courses', s.courses],
      ['Participants', s.participants],
      ['Enrollments', `${s.enrollments} (${s.completedEnrollments} completed)`],
      ['Eligible for bulk issue', s.eligible],
      ['Certificates', `${s.validCertificates} valid, ${s.revokedCertificates} revoked`],
      ['Audit events', s.auditEvents],
      ['Serial counters', counters],
      ['Last issued', formatInstant(s.lastIssuedAt, t.timeZone)],
    ]),
  ].join('\n');
}

export function renderCourses(rows: readonly CourseRow[]): string {
  return renderTable(
    [
      { header: 'Code', value: (c) => c.code },
      { header: 'Title', value: (c) => c.title, max: 36 },
      { header: 'Enrolled', value: (c) => c.enrolled, align: 'right' },
      { header: 'Completed', value: (c) => c.completed, align: 'right' },
      { header: 'Eligible', value: (c) => c.eligible, align: 'right' },
      { header: 'Valid', value: (c) => c.validCertificates, align: 'right' },
      { header: 'Revoked', value: (c) => c.revokedCertificates, align: 'right' },
    ],
    rows,
    '(no courses)',
  );
}

function certificateCell(e: EnrollmentRow): string {
  if (e.certificate) return `${e.certificate.serial} (${e.certificate.status})`;
  return e.status === 'completed' ? 'eligible' : '—';
}

export function renderCourseDetail(d: CourseDetail, timeZone: string): string {
  return [
    `${d.course.code} — ${d.course.title}`,
    '',
    renderTable(
      [
        { header: 'Participant', value: (e) => e.participantName, max: 30 },
        { header: 'Email', value: (e) => e.email, max: 32 },
        { header: 'Status', value: (e) => e.status },
        { header: 'Completed', value: (e) => formatInstant(e.completedAt, timeZone) },
        { header: 'Certificate', value: certificateCell },
      ],
      d.enrollments,
      '(no enrollments)',
    ),
  ].join('\n');
}

export function renderParticipants(p: Page<ParticipantRow>): string {
  return [
    renderTable(
      [
        { header: 'Id', value: (r) => r.id, align: 'right' },
        { header: 'Name', value: (r) => r.name, max: 30 },
        { header: 'Email', value: (r) => r.email, max: 36 },
        { header: 'Enrollments', value: (r) => r.enrollments, align: 'right' },
        { header: 'Certificates', value: (r) => r.certificates, align: 'right' },
      ],
      p.items,
      '(no participants)',
    ),
    pageLabel(p.page, p.pageSize, p.total),
  ].join('\n');
}

export function renderParticipantDetail(
  d: ParticipantDetail,
  timeZone: string,
): string {
  return [
    `${d.participant.name} <${d.participant.email}> (id ${d.participant.id})`,
    '',
    renderTable(
      [
        { header: 'Course', value: (e) => e.courseCode },
        { header: 'Title', value: (e) => e.courseTitle, max: 32 },
        { header: 'Status', value: (e) => e.status },
        { header: 'Enrolled', value: (e) => formatInstant(e.enrolledAt, timeZone) },
        { header: 'Completed', value: (e) => formatInstant(e.completedAt, timeZone) },
        { header: 'Certificate', value: certificateCell },
      ],
      d.enrollments,
      '(no enrollments)',
    ),
  ].join('\n');
}

export function renderCertificates(
  p: Page<CertificateRow>,
  timeZone: string,
  filterLabel?: string,
): string {
  return [
    ...(filterLabel ? [filterLabel] : []),
    renderTable(
      [
        { header: 'Serial', value: (c) => c.serial },
        { header: 'Participant', value: (c) => c.participantName, max: 30 },
        { header: 'Course', value: (c) => c.courseTitle, max: 32 },
        { header: 'Status', value: (c) => c.status },
        { header: 'Issued', value: (c) => formatInstant(c.issuedAt, timeZone) },
      ],
      p.items,
      '(no certificates match)',
    ),
    pageLabel(p.page, p.pageSize, p.total),
  ].join('\n');
}

function auditTable(rows: readonly AuditRow[], timeZone: string): string {
  return renderTable(
    [
      { header: 'When', value: (a) => formatInstant(a.occurredAt, timeZone) },
      { header: 'Action', value: (a) => a.action },
      { header: 'Actor', value: (a) => a.actorName, max: 24 },
      { header: 'Serial', value: (a) => a.serial },
      { header: 'Participant', value: (a) => a.participantName, max: 28 },
      { header: 'Course', value: (a) => a.courseTitle, max: 28 },
    ],
    rows,
    '(no audit events)',
  );
}

export function renderCertificateDetail(
  c: CertificateDetail,
  timeZone: string,
): string {
  const revoked: [string, string][] =
    c.status === 'revoked'
      ? [
          ['Revoked', formatInstant(c.revokedAt, timeZone)],
          ['Revoked by', c.revokedBy ?? '—'],
          ['Reason', c.revokeReason ?? '—'],
        ]
      : [];
  return [
    renderFields([
      ['Serial', c.serial],
      ['Status', c.status],
      ['Participant', `${c.participantName} (id ${c.participantId})`],
      ['Course', `${c.courseCode} — ${c.courseTitle}`],
      ['Issued', formatInstant(c.issuedAt, timeZone)],
      ['Issued (UTC)', c.issuedAt.toISOString()],
      ['Issued by', c.issuedBy],
      ...revoked,
      ['Certificate id', c.id],
      ['Enrollment id', c.enrollmentId],
    ]),
    '',
    'Audit trail',
    auditTable(c.auditEvents, timeZone),
  ].join('\n');
}

export function renderAudit(p: Page<AuditRow>, timeZone: string): string {
  return [auditTable(p.items, timeZone), pageLabel(p.page, p.pageSize, p.total)].join('\n');
}
