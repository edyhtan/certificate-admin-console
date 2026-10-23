import { ADELAIDE, ADELAIDE_PARTICIPANT_COUNT } from './adelaide.js';

const byKey = Object.fromEntries(ADELAIDE.certificates.map((c) => [c.key, c]));

function local(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Adelaide',
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

describe('ADELAIDE seed profile', () => {
  it('is the large tenant: 250 participants, 286 enrollments, 150 certificates', () => {
    expect(ADELAIDE_PARTICIPANT_COUNT).toBe(250);
    expect(ADELAIDE.participants).toHaveLength(250);
    expect(ADELAIDE.enrollments).toHaveLength(286);
    expect(ADELAIDE.certificates).toHaveLength(150);
  });

  it('is the same on every load (no randomness)', async () => {
    vi.resetModules();
    const again = await import('./adelaide.js');
    expect(again.ADELAIDE).not.toBe(ADELAIDE); // a fresh evaluation…
    expect(again.ADELAIDE).toEqual(ADELAIDE); // …with identical data
  });

  it('has 250 distinct names, with accents and apostrophes', () => {
    const names = ADELAIDE.participants.map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(names).size).toBe(250);
    expect(names).toContain("Isla O'Donnell");
    expect(names).toContain('Éloïse Nguyễn');
  });

  it('turns accents and apostrophes into plain ASCII emails', () => {
    expect(ADELAIDE.participants[0].email).toBe('isla.odonnell.1@example.com');
    expect(ADELAIDE.participants[15].email).toBe('eloise.odonnell.16@example.com');
  });

  it('has exactly one revoked certificate, the first one issued', () => {
    const revoked = ADELAIDE.certificates.filter((c) => c.revoked);
    expect(revoked.map((c) => c.key)).toEqual(['revoked']);
    expect(ADELAIDE.certificates[0].key).toBe('revoked');
    expect(byKey.revoked.serial).toBe('ADL-2026-000001');
  });

  it('DST end (5 Apr 2026): one at 01:30 ACDT (+10:30), one at 03:30 ACST (+9:30)', () => {
    expect(new Date(byKey.dstEndBefore.issuedAt).toISOString()).toBe('2026-04-04T15:00:00.000Z');
    expect(new Date(byKey.dstEndAfter.issuedAt).toISOString()).toBe('2026-04-04T18:00:00.000Z');
    expect(local(byKey.dstEndBefore.issuedAt)).toMatchObject({ day: '05', hour: '01', timeZoneName: 'GMT+10:30' });
    expect(local(byKey.dstEndAfter.issuedAt)).toMatchObject({ day: '05', hour: '03', timeZoneName: 'GMT+09:30' });
  });

  it('DST start (4 Oct 2026): one at 01:30 ACST (+9:30), one at 03:30 ACDT (+10:30)', () => {
    expect(new Date(byKey.dstStartBefore.issuedAt).toISOString()).toBe('2026-10-03T16:00:00.000Z');
    expect(new Date(byKey.dstStartAfter.issuedAt).toISOString()).toBe('2026-10-03T17:00:00.000Z');
    expect(local(byKey.dstStartBefore.issuedAt)).toMatchObject({ day: '04', hour: '01', timeZoneName: 'GMT+09:30' });
    expect(local(byKey.dstStartAfter.issuedAt)).toMatchObject({ day: '04', hour: '03', timeZoneName: 'GMT+10:30' });
  });
});
