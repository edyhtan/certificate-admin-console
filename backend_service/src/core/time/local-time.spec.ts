import { localDate, localYear } from './local-time.js';

const at = (iso: string) => new Date(iso);

describe('localYear / localDate', () => {
  describe('Perth (+8, no daylight saving)', () => {
    it('23:30 on 31 Dec 2026 local (15:30 UTC) is still 2026 and 31 Dec', () => {
      const instant = at('2026-12-31T15:30:00Z');
      expect(localYear(instant, 'Australia/Perth')).toBe(2026);
      expect(localDate(instant, 'Australia/Perth')).toBe('2026-12-31');
    });

    it('16:00 UTC on 31 Dec 2026 is already 1 Jan 2027 in Perth', () => {
      const instant = at('2026-12-31T16:00:00Z');
      expect(localYear(instant, 'Australia/Perth')).toBe(2027);
      expect(localDate(instant, 'Australia/Perth')).toBe('2027-01-01');
    });
  });

  describe('Sydney (+11 summer / +10 winter)', () => {
    it('00:30 on 1 Jan 2026 local is 2026, though UTC is still 2025', () => {
      const instant = at('2025-12-31T13:30:00Z');
      expect(localYear(instant, 'Australia/Sydney')).toBe(2026);
      expect(localDate(instant, 'Australia/Sydney')).toBe('2026-01-01');
      expect(localYear(instant, 'UTC')).toBe(2025);
    });

    it.each([
      // DST end, 5 Apr 2026 03:00 AEDT → 02:00 AEST
      ['2026-04-04T14:30:00Z', '2026-04-05'], // 01:30 AEDT
      ['2026-04-04T17:30:00Z', '2026-04-05'], // 03:30 AEST
      ['2026-04-04T12:59:00Z', '2026-04-04'], // 23:59 AEDT the night before
      // DST start, 4 Oct 2026 02:00 AEST → 03:00 AEDT
      ['2026-10-03T15:30:00Z', '2026-10-04'], // 01:30 AEST
      ['2026-10-03T16:30:00Z', '2026-10-04'], // 03:30 AEDT
      ['2026-10-03T13:59:00Z', '2026-10-03'], // 23:59 AEST the night before
    ])('%s is %s in Sydney', (iso, date) => {
      expect(localDate(at(iso), 'Australia/Sydney')).toBe(date);
    });
  });

  describe('Adelaide (+10:30 summer / +9:30 winter)', () => {
    it.each([
      // DST end, 5 Apr 2026 03:00 ACDT (+10:30) → 02:00 ACST (+9:30)
      ['2026-04-04T13:29:00Z', '2026-04-04'], // 23:59 ACDT
      ['2026-04-04T13:30:00Z', '2026-04-05'], // 00:00 ACDT
      ['2026-04-04T17:30:00Z', '2026-04-05'], // 03:00 ACST
      // DST start, 4 Oct 2026 02:00 ACST → 03:00 ACDT
      ['2026-10-03T14:29:00Z', '2026-10-03'], // 23:59 ACST
      ['2026-10-03T14:30:00Z', '2026-10-04'], // 00:00 ACST
      ['2026-10-03T16:30:00Z', '2026-10-04'], // 03:00 ACDT
    ])('%s is %s in Adelaide', (iso, date) => {
      expect(localDate(at(iso), 'Australia/Adelaide')).toBe(date);
    });

    it('the half-hour offset moves the new year: 13:29 UTC is 2026, 13:30 UTC is 2027', () => {
      expect(localYear(at('2026-12-31T13:29:00Z'), 'Australia/Adelaide')).toBe(2026);
      expect(localYear(at('2026-12-31T13:30:00Z'), 'Australia/Adelaide')).toBe(2027);
    });
  });

  it('pads month and day', () => {
    expect(localDate(at('2026-03-04T00:00:00Z'), 'UTC')).toBe('2026-03-04');
  });

  it('rejects an invalid instant', () => {
    expect(() => localYear(new Date('nope'), 'UTC')).toThrow(RangeError);
  });

  it('rejects an unknown zone', () => {
    expect(() => localDate(at('2026-01-01T00:00:00Z'), 'Mars/Base')).toThrow(RangeError);
  });
});
