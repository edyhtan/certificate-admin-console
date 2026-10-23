import type { PrismaClient } from '@prisma/client';
import { PrismaHealthProbe } from './prisma-health-probe.js';

function dbWith(queryRaw: ReturnType<typeof vi.fn>) {
  return { $queryRaw: queryRaw } as unknown as PrismaClient;
}

describe('PrismaHealthProbe', () => {
  it('has the name it was given', () => {
    expect(new PrismaHealthProbe('database', dbWith(vi.fn())).name).toBe(
      'database',
    );
  });

  it('resolves when SELECT 1 answers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ 1: 1 }]);
    await expect(
      new PrismaHealthProbe('database', dbWith(queryRaw)).check(),
    ).resolves.toBeUndefined();
    const [strings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('')).toBe('SELECT 1');
  });

  it('rejects when the query fails', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error("Can't reach database"));
    await expect(
      new PrismaHealthProbe('database', dbWith(queryRaw)).check(),
    ).rejects.toThrow("Can't reach database");
  });
});
