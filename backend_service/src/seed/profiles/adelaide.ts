import type { SeedProfile } from '../seed-profile.js';

/**
 * Adelaide: Australia/Adelaide is +10:30 (ACDT) in summer and +9:30 (ACST) in winter: a
 * half-hour offset with daylight saving.
 *
 * The large tenant (D61): 250 participants and about 150 certificates, so the list has several
 * pages and search, sort and export have real volume. The rows are generated, but by fixed rules
 * with no randomness, so every run produces exactly the same data.
 *
 * Edge cases (spec §4), on fixed participants:
 * - `revoked`: a revoked certificate with its reason.
 * - `dstEndBefore` / `dstEndAfter`: either side of 5 Apr 2026, when 03:00 ACDT becomes 02:00 ACST.
 * - `dstStartBefore` / `dstStartAfter`: either side of 4 Oct 2026, when 02:00 ACST becomes 03:00 ACDT.
 */

/** 25 × 10 = 250 distinct names, including accents and apostrophes. */
const FIRST_NAMES = [
  'Isla', 'Jayden', 'Saoirse', 'Hamish', 'Léa', 'Rangi', 'Ananya', 'Connor', 'Zara', 'Mia',
  'Lucas', 'Grace', 'Oscar', 'Ivy', 'Dmitri', 'Éloïse', 'Ben', 'Aaliyah', 'Mateus', 'Chloë',
  'Tane', 'Priyanka', 'Finn', 'Noor', 'Wiremu',
];
const LAST_NAMES = [
  "O'Donnell", 'Campbell', 'Nguyễn', 'McLeod', 'Martin', 'Parata', 'Iyer', 'Walsh', 'Ahmed', 'Hoffmann',
];
export const ADELAIDE_PARTICIPANT_COUNT = FIRST_NAMES.length * LAST_NAMES.length;

const COURSES = [
  { code: 'RSA-101', title: 'Responsible Service of Alcohol' },
  { code: 'WINE-201', title: 'Wine Appreciation' },
  { code: 'MGT-301', title: 'Project Management' },
];
const ENROLLED_AT = ['2026-01-12T09:00:00+10:30', '2026-02-02T09:00:00+10:30', '2026-02-09T09:00:00+10:30'];
const COMPLETED_AT = ['2026-02-13T16:00:00+10:30', '2026-03-13T16:00:00+10:30', '2026-03-20T16:00:00+10:30'];

/** Plain ASCII for email addresses: `Éloïse O'Donnell` → `eloise.odonnell`. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}

const participants = Array.from({ length: ADELAIDE_PARTICIPANT_COUNT }, (_, i) => {
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length)];
  return { firstName, lastName, email: `${slug(firstName)}.${slug(lastName)}.${i + 1}@example.com` };
});

/** Participant i takes course i % 3; every 6th (i % 6 = 5) is still enrolled. */
const primaryCourse = (i: number) => i % COURSES.length;
const completesPrimary = (i: number) => i % 6 !== 5;
/** Every 7th also takes the next course (completed for even i): left for bulk issue. */
const hasSecond = (i: number) => i % 7 === 0;
/** 70% of completed primary enrollments already hold a certificate. */
const certifiedPrimary = (i: number) => completesPrimary(i) && i % 10 < 7;

const enrollments = participants.flatMap((p, i) => {
  const c = primaryCourse(i);
  const rows: SeedProfile['enrollments'] = [
    completesPrimary(i)
      ? { participant: p.email, course: COURSES[c].code, status: 'completed', enrolledAt: ENROLLED_AT[c], completedAt: COMPLETED_AT[c] }
      : { participant: p.email, course: COURSES[c].code, status: 'enrolled', enrolledAt: ENROLLED_AT[c] },
  ];
  if (hasSecond(i)) {
    const s = (c + 1) % COURSES.length;
    rows.push(
      i % 2 === 0
        ? { participant: p.email, course: COURSES[s].code, status: 'completed', enrolledAt: ENROLLED_AT[s], completedAt: COMPLETED_AT[s] }
        : { participant: p.email, course: COURSES[s].code, status: 'enrolled', enrolledAt: ENROLLED_AT[s] },
    );
  }
  return rows;
});

/** Fixed issue times for the edge cases, on participants 0, 3, 6 (RSA) and 1, 4 (WINE). */
const SPECIAL: Record<number, { key: string; issuedAt: string; revoked?: { at: string; reason: string } }> = {
  0: {
    key: 'revoked',
    issuedAt: '2026-02-16T10:00:00+10:30',
    revoked: { at: '2026-02-17T09:30:00+10:30', reason: 'Duplicate of an earlier certificate' },
  },
  3: { key: 'dstEndBefore', issuedAt: '2026-04-05T01:30:00+10:30' },
  6: { key: 'dstEndAfter', issuedAt: '2026-04-05T03:30:00+09:30' },
  1: { key: 'dstStartBefore', issuedAt: '2026-10-04T01:30:00+09:30' },
  4: { key: 'dstStartAfter', issuedAt: '2026-10-04T03:30:00+10:30' },
};

/** The rest are issued every 34 hours from 23 Mar 2026, after every course has completions. */
const REGULAR_START = Date.parse('2026-03-23T00:00:00Z');
const REGULAR_STEP_MS = 34 * 60 * 60 * 1000;

const unnumbered = participants
  .map((p, i) => ({ p, i }))
  .filter(({ i }) => certifiedPrimary(i))
  .map(({ p, i }, n) => {
    const special = SPECIAL[i];
    return {
      key: special?.key ?? `p${i + 1}`,
      participant: p.email,
      course: COURSES[primaryCourse(i)].code,
      issuedAt: special?.issuedAt ?? new Date(REGULAR_START + n * REGULAR_STEP_MS).toISOString(),
      ...(special?.revoked && { revoked: special.revoked }),
    };
  });

/** Serials in issue order. All fall in 2026 in Adelaide, so one sequence. */
const certificates: SeedProfile['certificates'] = unnumbered
  .sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt))
  .map((c, n) => ({ ...c, serial: `ADL-2026-${String(n + 1).padStart(6, '0')}` }));

export const ADELAIDE: SeedProfile = {
  timeZone: 'Australia/Adelaide',
  serialPrefix: 'ADL',
  admin: { username: 'admin', name: 'Administrator' },
  courses: COURSES,
  participants,
  enrollments,
  certificates,
};
