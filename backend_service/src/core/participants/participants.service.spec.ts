import type { PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { ParticipantsService } from './participants.service.js';

function serviceWith(create: ReturnType<typeof vi.fn>) {
  const db = { participant: { create } } as unknown as PrismaClient;
  return new ParticipantsService(
    new FixedAppContext({
      db,
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
      actor: { id: 1, name: 'Administrator' },
    }),
  );
}

describe('ParticipantsService', () => {
  it('creates a participant with the validated values, selecting only API fields', async () => {
    const created = { id: 16, firstName: 'Bảo', lastName: 'Nguyễn', email: 'bao@x.com' };
    const create = vi.fn().mockResolvedValue(created);
    await expect(
      serviceWith(create).create({ firstName: 'Bảo', lastName: 'Nguyễn', email: 'bao@x.com' }),
    ).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: { firstName: 'Bảo', lastName: 'Nguyễn', email: 'bao@x.com' },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  });

  it('lets a unique-key clash through for the error filter to map', async () => {
    const clash = Object.assign(new Error('Unique constraint'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: 'email' },
    });
    await expect(
      serviceWith(vi.fn().mockRejectedValue(clash)).create({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.co',
      }),
    ).rejects.toBe(clash);
  });
});
