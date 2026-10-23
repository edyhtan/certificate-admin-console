import { TENANT_CODES, TENANTS } from '../../tenancy/tenants.js';
import { parseSerial } from '../seed.js';
import { SEED_PROFILES } from './index.js';

const localYear = (iso: string, timeZone: string) =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(new Date(iso)));

// Rules every tenant's seed must follow, whatever its size (D55, D63).
describe.each(TENANT_CODES)('%s seed profile', (code) => {
  const profile = SEED_PROFILES[code];

  it('matches the registry zone and code', () => {
    expect(profile.timeZone).toBe(TENANTS[code].timezone);
    expect(profile.serialPrefix).toBe(code);
    expect(profile.admin).toEqual({ username: 'admin', name: 'Administrator' });
  });

  it('has 3 courses with unique codes', () => {
    expect(profile.courses).toHaveLength(3);
    expect(new Set(profile.courses.map((c) => c.code)).size).toBe(3);
  });

  it('has unique, lower-case emails and names within limits', () => {
    const emails = profile.participants.map((p) => p.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const p of profile.participants) {
      expect(p.email).toBe(p.email.toLowerCase());
      expect(p.email).toMatch(/^[a-z0-9.]+@example\.com$/);
      expect(p.firstName.length).toBeLessThanOrEqual(100);
      expect(p.lastName.length).toBeLessThanOrEqual(100);
    }
  });

  it('only enrolls known participants in known courses, once per pair, dated correctly', () => {
    const emails = new Set(profile.participants.map((p) => p.email));
    const codes = new Set(profile.courses.map((c) => c.code));
    const pairs = profile.enrollments.map((e) => `${e.participant}|${e.course}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const e of profile.enrollments) {
      expect(emails.has(e.participant)).toBe(true);
      expect(codes.has(e.course)).toBe(true);
      if (e.status === 'completed') {
        expect(Date.parse(e.completedAt!)).toBeGreaterThan(Date.parse(e.enrolledAt));
      } else {
        expect(e.completedAt).toBeUndefined();
      }
    }
  });

  it('issues each certificate on a completed enrollment, after completion and before today', () => {
    const today = Date.parse('2026-10-22T00:00:00Z');
    for (const c of profile.certificates) {
      const e = profile.enrollments.find((x) => x.participant === c.participant && x.course === c.course);
      expect(e?.status, c.key).toBe('completed');
      expect(Date.parse(c.issuedAt), c.key).toBeGreaterThan(Date.parse(e!.completedAt!));
      expect(Date.parse(c.issuedAt), c.key).toBeLessThan(today);
      if (c.revoked) expect(Date.parse(c.revoked.at)).toBeGreaterThan(Date.parse(c.issuedAt));
    }
  });

  it('numbers serials 1, 2, 3… per tenant-local year, in issue order', () => {
    const lastByYear = new Map<number, number>();
    let previous = 0;
    for (const c of profile.certificates) {
      const { year, sequence } = parseSerial(c.serial, code);
      expect(year, c.key).toBe(localYear(c.issuedAt, profile.timeZone));
      expect(sequence, c.key).toBe((lastByYear.get(year) ?? 0) + 1);
      lastByYear.set(year, sequence);
      expect(Date.parse(c.issuedAt), c.key).toBeGreaterThanOrEqual(previous);
      previous = Date.parse(c.issuedAt);
    }
  });

  it('has unique certificate keys and serials', () => {
    expect(new Set(profile.certificates.map((c) => c.key)).size).toBe(profile.certificates.length);
    expect(new Set(profile.certificates.map((c) => c.serial)).size).toBe(profile.certificates.length);
  });
});

describe('seed sizes across tenants (D63)', () => {
  it('gives Sydney a small set, Perth none, and Adelaide the most', () => {
    expect(SEED_PROFILES.SYD.participants).toHaveLength(15);
    expect(SEED_PROFILES.PER.participants).toHaveLength(0);
    expect(SEED_PROFILES.ADL.participants).toHaveLength(250);
  });
});
