import type { SeedProfile } from '../seed-profile.js';

/**
 * Sydney: the only tenant in M1-M2 and the baseline for API tests (D48).
 * Australia/Sydney is +11 (AEDT) in summer and +10 (AEST) in winter.
 *
 * Edge cases (spec §4):
 * - `newYear`: 00:30 on 1 Jan 2026 in Sydney is still 31 Dec 2025 in UTC; its local date and
 *   serial year are 2026.
 * - `dstEndBefore` / `dstEndAfter`: either side of 5 Apr 2026, when 03:00 AEDT becomes 02:00 AEST.
 * - `dstStartBefore` / `dstStartAfter`: either side of 4 Oct 2026, when 02:00 AEST becomes 03:00 AEDT.
 * - `revoked`: a revoked certificate with its reason.
 *
 * Eligible for bulk issue (completed, no certificate): FA-101 5, WHS-201 5, LDR-301 3.
 */

const email = (local: string) => `${local}@example.com`;

const P = {
  ana: email('ana.oneil'),
  bao: email('bao.nguyen'),
  chloe: email('chloe.dubois'),
  liam: email('liam.oconnor'),
  zoe: email('zoe.muller'),
  mateo: email('mateo.garcia'),
  aroha: email('aroha.ngata'),
  priya: email('priya.sharma'),
  jack: email('jack.thompson'),
  mei: email('mei.chen'),
  oliver: email('oliver.smith'),
  sofia: email('sofia.rossi'),
  noah: email('noah.williams'),
  isabella: email('isabella.brown'),
  ethan: email('ethan.kowalski'),
};

const FA = 'FA-101';
const WHS = 'WHS-201';
const LDR = 'LDR-301';

const ENROLLED_FA = '2025-11-03T09:00:00+11:00';
const DONE_FA = '2025-12-12T16:00:00+11:00';
const ENROLLED_WHS = '2026-02-02T09:00:00+11:00';
const DONE_WHS = '2026-03-27T16:00:00+11:00';
const ENROLLED_LDR = '2026-07-06T09:00:00+10:00';
const DONE_LDR = '2026-09-25T16:00:00+10:00';

const completed = (participant: string, course: string, enrolledAt: string, completedAt: string) =>
  ({ participant, course, status: 'completed', enrolledAt, completedAt }) as const;
const enrolled = (participant: string, course: string, enrolledAt: string) =>
  ({ participant, course, status: 'enrolled', enrolledAt }) as const;

export const SYDNEY: SeedProfile = {
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
  admin: { username: 'admin', name: 'Administrator' },
  courses: [
    { code: FA, title: 'First Aid Essentials' },
    { code: WHS, title: 'Workplace Health and Safety' },
    { code: LDR, title: 'Leading Teams' },
  ],
  participants: [
    { firstName: 'Ana', lastName: "O'Neil", email: P.ana },
    { firstName: 'Bảo', lastName: 'Nguyễn', email: P.bao },
    { firstName: 'Chloé', lastName: 'Dubois', email: P.chloe },
    { firstName: 'Liam', lastName: "O'Connor", email: P.liam },
    { firstName: 'Zoë', lastName: 'Müller', email: P.zoe },
    { firstName: 'Mateo', lastName: 'García', email: P.mateo },
    { firstName: 'Aroha', lastName: 'Ngata', email: P.aroha },
    { firstName: 'Priya', lastName: 'Sharma', email: P.priya },
    { firstName: 'Jack', lastName: 'Thompson', email: P.jack },
    { firstName: 'Mei', lastName: 'Chen', email: P.mei },
    { firstName: 'Oliver', lastName: 'Smith', email: P.oliver },
    { firstName: 'Sofia', lastName: 'Rossi', email: P.sofia },
    { firstName: 'Noah', lastName: 'Williams', email: P.noah },
    { firstName: 'Isabella', lastName: 'Brown', email: P.isabella },
    { firstName: 'Ethan', lastName: 'Kowalski', email: P.ethan },
  ],
  enrollments: [
    // First Aid: 8 completed (3 certified), 2 still enrolled.
    ...[P.ana, P.bao, P.chloe, P.liam, P.zoe, P.mateo, P.aroha, P.priya].map((p) =>
      completed(p, FA, ENROLLED_FA, DONE_FA),
    ),
    enrolled(P.jack, FA, ENROLLED_FA),
    enrolled(P.mei, FA, ENROLLED_FA),
    // Workplace Health and Safety: 7 completed (2 certified), 2 still enrolled.
    ...[P.zoe, P.mateo, P.aroha, P.priya, P.jack, P.mei, P.oliver].map((p) =>
      completed(p, WHS, ENROLLED_WHS, DONE_WHS),
    ),
    enrolled(P.sofia, WHS, ENROLLED_WHS),
    enrolled(P.noah, WHS, ENROLLED_WHS),
    // Leading Teams: 4 completed (1 certified), 2 still enrolled.
    ...[P.oliver, P.sofia, P.noah, P.ana].map((p) => completed(p, LDR, ENROLLED_LDR, DONE_LDR)),
    enrolled(P.isabella, LDR, ENROLLED_LDR),
    enrolled(P.ethan, LDR, ENROLLED_LDR),
  ],
  certificates: [
    {
      key: 'newYear',
      participant: P.ana,
      course: FA,
      serial: 'SYD-2026-000001',
      issuedAt: '2026-01-01T00:30:00+11:00',
    },
    {
      key: 'revoked',
      participant: P.bao,
      course: FA,
      serial: 'SYD-2026-000002',
      issuedAt: '2026-02-10T09:00:00+11:00',
      revoked: { at: '2026-02-11T10:00:00+11:00', reason: 'Name misspelt on certificate' },
    },
    {
      key: 'dstEndBefore',
      participant: P.chloe,
      course: FA,
      serial: 'SYD-2026-000003',
      issuedAt: '2026-04-05T01:30:00+11:00',
    },
    {
      key: 'dstEndAfter',
      participant: P.zoe,
      course: WHS,
      serial: 'SYD-2026-000004',
      issuedAt: '2026-04-05T03:30:00+10:00',
    },
    {
      key: 'dstStartBefore',
      participant: P.mateo,
      course: WHS,
      serial: 'SYD-2026-000005',
      issuedAt: '2026-10-04T01:30:00+10:00',
    },
    {
      key: 'dstStartAfter',
      participant: P.oliver,
      course: LDR,
      serial: 'SYD-2026-000006',
      issuedAt: '2026-10-04T03:30:00+11:00',
    },
  ],
};
