import type { PrismaClient } from '@prisma/client';
import { profileFor, setUpDatabase } from './db-setup.js';
import { SYDNEY } from './profiles/sydney.js';

describe('profileFor', () => {
  it('picks the Sydney profile for SYD in Australia/Sydney', () => {
    expect(profileFor('SYD', 'Australia/Sydney')).toBe(SYDNEY);
  });

  it('fails for a prefix without a profile', () => {
    expect(() => profileFor('XYZ', 'Australia/Sydney')).toThrow(
      'no seed profile for APP_SERIAL_PREFIX=XYZ',
    );
  });

  it('fails when the timezone does not match the profile', () => {
    expect(() => profileFor('SYD', 'Australia/Perth')).toThrow(
      'seed profile SYD is for Australia/Sydney, but APP_TIMEZONE=Australia/Perth',
    );
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
    await expect(
      setUpDatabase(db as unknown as PrismaClient, SYDNEY),
    ).resolves.toBe('seeded');
    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('leaves a seeded database alone', async () => {
    const db = dbWithAdmins(1);
    await expect(
      setUpDatabase(db as unknown as PrismaClient, SYDNEY),
    ).resolves.toBe('already seeded');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
