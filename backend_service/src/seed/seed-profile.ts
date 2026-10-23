/**
 * One tenant's demo data, written out in full so every run creates exactly the same rows
 * (no random values, no `now()`). Rows are inserted in array order, so on an empty database
 * the n-th course gets id n, and so on.
 *
 * Instants are ISO-8601 strings with the local offset spelt out, e.g. `2026-01-01T00:30:00+11:00`.
 */
export interface SeedProfile {
  /** IANA zone the data is designed around, e.g. `Australia/Sydney`. */
  timeZone: string;
  serialPrefix: string;
  admin: { username: string; name: string };
  courses: { code: string; title: string }[];
  participants: { firstName: string; lastName: string; email: string }[];
  /** `participant` is an email, `course` a code. */
  enrollments: {
    participant: string;
    course: string;
    status: 'enrolled' | 'completed';
    enrolledAt: string;
    completedAt?: string;
  }[];
  /**
   * Already issued certificates, in issue order. `key` names the row for tests.
   * `serial` is written out; a unit test checks its year is the local year of `issuedAt`.
   */
  certificates: {
    key: string;
    participant: string;
    course: string;
    serial: string;
    issuedAt: string;
    revoked?: { at: string; reason: string };
  }[];
}
