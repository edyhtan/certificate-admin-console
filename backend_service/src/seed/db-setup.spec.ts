import type { PrismaClient } from '@prisma/client';
import { profileFor, setUpDatabase } from './db-setup.js';
import { SEED_PROFILES } from './profiles/index.js';
import { ADELAIDE } from './profiles/adelaide.js';
import { PERTH } from './profiles/perth.js';
import { SYDNEY } from './profiles/sydney.js';

describe('profileFor', () => {
  it.each([
    ['SYD', SYDNEY],
    ['PER', PERTH],
    ['ADL', ADELAIDE],
  ] as const)('picks the %s profile', (code, profile) => {
    expect(profileFor(code)).toBe(profile);
  });

  it('fails for a code without a profile', () => {
    expect(() => profileFor('XYZ' as never)).toThrow('no seed profile for tenant XYZ');
  });

  it('fails when a profile’s zone or prefix disagrees with the registry', () => {
    const original = SEED_PROFILES.PER;
    const profiles = SEED_PROFILES as Record<string, typeof original>;
    try {
      profiles.PER = { ...original, timeZone: 'Australia/Sydney' };
      expect(() => profileFor('PER')).toThrow(
        'seed profile for PER is for Australia/Sydney, but the registry says Australia/Perth',
      );
      profiles.PER = { ...original, serialPrefix: 'SYD' };
      expect(() => profileFor('PER')).toThrow('seed profile for PER uses serial prefix SYD');
    } finally {
      profiles.PER = original;
    }
  });
});

describe('setUpDatabase', () => {
  function dbWithAdmins(count: number) {
    return {
      admin: { count: vi.fn().mockResolvedValue(count) },
      $transaction: vi.fn().mockResolvedValue({}),
    };
  }

  it('seeds an empty database', async () => {
    const db = dbWithAdmins(0);
    await expect(setUpDatabase(db as unknown as PrismaClient, SYDNEY)).resolves.toBe('seeded');
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('leaves a seeded database alone', async () => {
    const db = dbWithAdmins(1);
    await expect(setUpDatabase(db as unknown as PrismaClient, SYDNEY)).resolves.toBe('already seeded');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
