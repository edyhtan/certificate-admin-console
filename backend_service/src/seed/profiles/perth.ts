import type { SeedProfile } from '../seed-profile.js';

/**
 * Perth: Australia/Perth is +8 all year (no daylight saving).
 *
 * Deliberately empty apart from its admin and courses (D63): no participants, enrollments or
 * certificates. It shows the web app's "no certificates yet" state, a bulk issue preview of 0,
 * and empty CSV exports and audit logs. Perth's year-boundary cases (23:30 on 31 Dec local) are
 * covered by the time-helper tests, and isolation tests create their own Perth rows.
 */
export const PERTH: SeedProfile = {
  timeZone: 'Australia/Perth',
  serialPrefix: 'PER',
  admin: { username: 'admin', name: 'Administrator' },
  courses: [
    { code: 'FA-101', title: 'First Aid Essentials' },
    { code: 'MINE-110', title: 'Mine Site Safety Induction' },
    { code: 'CUS-210', title: 'Customer Service Excellence' },
  ],
  participants: [],
  enrollments: [],
  certificates: [],
};
