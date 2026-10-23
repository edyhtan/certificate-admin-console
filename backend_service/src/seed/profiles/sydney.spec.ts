import { parseSerial } from '../seed.js';
import { SYDNEY } from './sydney.js';

/** Local wall-clock parts of an instant in a zone, e.g. { year: '2026', hour: '00', ... }. */
function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

const byKey = Object.fromEntries(SYDNEY.certificates.map((c) => [c.key, c]));

describe('SYDNEY seed profile', () => {
  it('is the Sydney tenant', () => {
    expect(SYDNEY.timeZone).toBe('Australia/Sydney');
    expect(SYDNEY.serialPrefix).toBe('SYD');
    expect(SYDNEY.admin).toEqual({ username: 'admin', name: 'Administrator' });
  });

  it('has 3 courses and 15 participants', () => {
    expect(SYDNEY.courses).toHaveLength(3);
    expect(SYDNEY.participants).toHaveLength(15);
  });

  it('includes names with apostrophes and accents', () => {
    const names = SYDNEY.participants.map((p) => `${p.firstName} ${p.lastName}`);
    expect(names).toContain("Ana O'Neil");
    expect(names).toContain('Bảo Nguyễn');
    expect(names.some((n) => /[À-ỹ]/.test(n))).toBe(true);
  });

  it('has unique, lower-case emails and unique course codes', () => {
    const emails = SYDNEY.participants.map((p) => p.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) expect(e).toBe(e.toLowerCase());
    const codes = SYDNEY.courses.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('only enrolls known participants in known courses, once per pair', () => {
    const emails = new Set(SYDNEY.participants.map((p) => p.email));
    const codes = new Set(SYDNEY.courses.map((c) => c.code));
    const pairs = SYDNEY.enrollments.map((e) => `${e.participant}|${e.course}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const e of SYDNEY.enrollments) {
      expect(emails.has(e.participant)).toBe(true);
      expect(codes.has(e.course)).toBe(true);
    }
  });

  it('gives completed enrollments a completion date and enrolled ones none', () => {
    for (const e of SYDNEY.enrollments) {
      if (e.status === 'completed') {
        expect(new Date(e.completedAt!).getTime()).toBeGreaterThan(
          new Date(e.enrolledAt).getTime(),
        );
      } else {
        expect(e.completedAt).toBeUndefined();
      }
    }
  });

  it('mixes enrolled and completed in every course, with learners left to issue', () => {
    const certified = new Set(
      SYDNEY.certificates.map((c) => `${c.participant}|${c.course}`),
    );
    for (const course of SYDNEY.courses) {
      const rows = SYDNEY.enrollments.filter((e) => e.course === course.code);
      expect(rows.some((e) => e.status === 'enrolled'), course.code).toBe(true);
      const eligible = rows.filter(
        (e) => e.status === 'completed' && !certified.has(`${e.participant}|${e.course}`),
      );
      expect(eligible.length, course.code).toBeGreaterThan(0);
    }
  });

  it('issues each certificate on a completed enrollment, after completion', () => {
    for (const c of SYDNEY.certificates) {
      const e = SYDNEY.enrollments.find(
        (x) => x.participant === c.participant && x.course === c.course,
      );
      expect(e?.status, c.key).toBe('completed');
      expect(new Date(c.issuedAt).getTime(), c.key).toBeGreaterThan(
        new Date(e!.completedAt!).getTime(),
      );
    }
  });

  it('numbers serials 1, 2, 3… in issue order, with the Sydney local year', () => {
    let previous = 0;
    SYDNEY.certificates.forEach((c, i) => {
      const { year, sequence } = parseSerial(c.serial, 'SYD');
      expect(sequence, c.key).toBe(i + 1);
      expect(String(year), c.key).toBe(localParts(c.issuedAt, SYDNEY.timeZone).year);
      const at = new Date(c.issuedAt).getTime();
      expect(at, c.key).toBeGreaterThan(previous);
      previous = at;
    });
  });

  it('has one revoked certificate, revoked after it was issued', () => {
    const revoked = SYDNEY.certificates.filter((c) => c.revoked);
    expect(revoked.map((c) => c.key)).toEqual(['revoked']);
    expect(new Date(revoked[0].revoked!.at).getTime()).toBeGreaterThan(
      new Date(revoked[0].issuedAt).getTime(),
    );
  });

  describe('edge cases (spec §4)', () => {
    it('newYear: 00:30 local on 1 Jan 2026 is 13:30 UTC on 31 Dec 2025', () => {
      const c = byKey.newYear;
      expect(new Date(c.issuedAt).toISOString()).toBe('2025-12-31T13:30:00.000Z');
      expect(localParts(c.issuedAt, SYDNEY.timeZone)).toMatchObject({
        year: '2026',
        month: '01',
        day: '01',
        hour: '00',
        minute: '30',
      });
      expect(c.serial.startsWith('SYD-2026-')).toBe(true);
    });

    it('DST end (5 Apr 2026): one at 01:30 AEDT (+11), one at 03:30 AEST (+10)', () => {
      expect(new Date(byKey.dstEndBefore.issuedAt).toISOString()).toBe(
        '2026-04-04T14:30:00.000Z',
      );
      expect(new Date(byKey.dstEndAfter.issuedAt).toISOString()).toBe(
        '2026-04-04T17:30:00.000Z',
      );
      expect(localParts(byKey.dstEndBefore.issuedAt, SYDNEY.timeZone)).toMatchObject({
        day: '05',
        hour: '01',
        timeZoneName: 'GMT+11:00',
      });
      expect(localParts(byKey.dstEndAfter.issuedAt, SYDNEY.timeZone)).toMatchObject({
        day: '05',
        hour: '03',
        timeZoneName: 'GMT+10:00',
      });
    });

    it('DST start (4 Oct 2026): one at 01:30 AEST (+10), one at 03:30 AEDT (+11)', () => {
      expect(new Date(byKey.dstStartBefore.issuedAt).toISOString()).toBe(
        '2026-10-03T15:30:00.000Z',
      );
      expect(new Date(byKey.dstStartAfter.issuedAt).toISOString()).toBe(
        '2026-10-03T16:30:00.000Z',
      );
      expect(localParts(byKey.dstStartBefore.issuedAt, SYDNEY.timeZone)).toMatchObject({
        day: '04',
        hour: '01',
        timeZoneName: 'GMT+10:00',
      });
      expect(localParts(byKey.dstStartAfter.issuedAt, SYDNEY.timeZone)).toMatchObject({
        day: '04',
        hour: '03',
        timeZoneName: 'GMT+11:00',
      });
    });
  });
});
