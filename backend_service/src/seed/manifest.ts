import { ADELAIDE } from './profiles/adelaide.js';
import { PERTH } from './profiles/perth.js';
import { SYDNEY } from './profiles/sydney.js';
import type { SeedProfile } from './seed-profile.js';

export interface SeededCertificate {
  /** Id on a freshly seeded database (rows are inserted in profile order). */
  id: number;
  serial: string;
  participantName: string;
  courseCode: string;
  courseTitle: string;
  /** UTC ISO string, as the API returns it. */
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface SeedManifest {
  timeZone: string;
  serialPrefix: string;
  admin: { id: number; username: string; name: string };
  counts: {
    admins: number;
    courses: number;
    participants: number;
    enrollments: number;
    completedEnrollments: number;
    certificates: number;
    revokedCertificates: number;
    auditEvents: number;
  };
  /** Course code → id on a freshly seeded database. */
  courseIds: Record<string, number>;
  /** Course code → completed enrollments without a certificate (what bulk issue would issue). */
  eligibleByCourse: Record<string, number>;
  /** By the profile's certificate `key`. */
  certificates: Record<string, SeededCertificate>;
}

/** What a seeded database contains, worked out from the profile, for tests to assert against. */
export function seedManifest(profile: SeedProfile): SeedManifest {
  const courseIds = Object.fromEntries(
    profile.courses.map((c, i) => [c.code, i + 1]),
  );
  const names = new Map(
    profile.participants.map((p) => [p.email, `${p.firstName} ${p.lastName}`]),
  );
  const titles = new Map(profile.courses.map((c) => [c.code, c.title]));
  const certified = new Set(
    profile.certificates.map((c) => `${c.participant}|${c.course}`),
  );

  const eligibleByCourse = Object.fromEntries(
    profile.courses.map((c) => [
      c.code,
      profile.enrollments.filter(
        (e) =>
          e.course === c.code &&
          e.status === 'completed' &&
          !certified.has(`${e.participant}|${e.course}`),
      ).length,
    ]),
  );

  const certificates = Object.fromEntries(
    profile.certificates.map((c, i) => [
      c.key,
      {
        id: i + 1,
        serial: c.serial,
        participantName: names.get(c.participant) ?? '',
        courseCode: c.course,
        courseTitle: titles.get(c.course) ?? '',
        issuedAt: new Date(c.issuedAt).toISOString(),
        revokedAt: c.revoked ? new Date(c.revoked.at).toISOString() : null,
        revokeReason: c.revoked?.reason ?? null,
      },
    ]),
  );

  const revoked = profile.certificates.filter((c) => c.revoked).length;
  return {
    timeZone: profile.timeZone,
    serialPrefix: profile.serialPrefix,
    admin: { id: 1, ...profile.admin },
    counts: {
      admins: 1,
      courses: profile.courses.length,
      participants: profile.participants.length,
      enrollments: profile.enrollments.length,
      completedEnrollments: profile.enrollments.filter(
        (e) => e.status === 'completed',
      ).length,
      certificates: profile.certificates.length,
      revokedCertificates: revoked,
      auditEvents: profile.certificates.length + revoked,
    },
    courseIds,
    eligibleByCourse,
    certificates,
  };
}

/** The Sydney seed: the default API test baseline (D48). */
export const SYDNEY_SEED = seedManifest(SYDNEY);
export const PERTH_SEED = seedManifest(PERTH);
export const ADELAIDE_SEED = seedManifest(ADELAIDE);
