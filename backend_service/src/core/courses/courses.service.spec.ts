import type { PrismaClient } from '@prisma/client';
import { FixedAppContext } from '../context/fixed-app-context.js';
import { CoursesService } from './courses.service.js';

function serviceWith(course: Record<string, ReturnType<typeof vi.fn>>) {
  const db = { course } as unknown as PrismaClient;
  const ctx = new FixedAppContext({
    db,
    timeZone: 'Australia/Sydney',
    serialPrefix: 'SYD',
    actor: { id: 1, name: 'Administrator' },
  });
  return new CoursesService(ctx);
}

describe('CoursesService', () => {
  it('lists courses by title, then id, selecting only API fields', async () => {
    const rows = [
      { id: 1, code: 'FA-101', title: 'First Aid Essentials' },
      { id: 3, code: 'LDR-301', title: 'Leading Teams' },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    await expect(serviceWith({ findMany }).list()).resolves.toEqual({ items: rows });
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, code: true, title: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
  });

  it('returns an empty list when there are no courses', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await expect(serviceWith({ findMany }).list()).resolves.toEqual({ items: [] });
  });

  it('creates a course with the validated values', async () => {
    const created = { id: 4, code: 'FA-201', title: 'Advanced First Aid' };
    const create = vi.fn().mockResolvedValue(created);
    await expect(
      serviceWith({ create }).create({ code: 'FA-201', title: 'Advanced First Aid' }),
    ).resolves.toEqual(created);
    expect(create).toHaveBeenCalledWith({
      data: { code: 'FA-201', title: 'Advanced First Aid' },
      select: { id: true, code: true, title: true },
    });
  });

  it('lets a unique-key clash through for the error filter to map', async () => {
    const clash = Object.assign(new Error('Unique constraint'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: 'code' },
    });
    const create = vi.fn().mockRejectedValue(clash);
    await expect(
      serviceWith({ create }).create({ code: 'FA-101', title: 'x' }),
    ).rejects.toBe(clash);
  });
});
