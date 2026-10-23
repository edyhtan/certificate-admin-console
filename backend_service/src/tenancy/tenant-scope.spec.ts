import type { PrismaClient } from '@prisma/client';
import { TenantScopeStore, type TenantScope } from './tenant-scope.js';

const scope = (code: 'SYD' | 'PER'): TenantScope => ({
  code,
  db: { tag: code } as unknown as PrismaClient,
  timeZone: code === 'SYD' ? 'Australia/Sydney' : 'Australia/Perth',
  actor: { id: 1, name: 'Administrator' },
});

describe('TenantScopeStore', () => {
  const store = new TenantScopeStore();

  it('has no scope outside run', () => {
    expect(store.current()).toBeUndefined();
  });

  it('gives the scope inside run, and returns what fn returns', () => {
    expect(store.run(scope('SYD'), () => store.current()?.code)).toBe('SYD');
    expect(store.current()).toBeUndefined();
  });

  it('keeps the scope across awaits, timers and promise chains', async () => {
    const seen = await store.run(scope('PER'), async () => {
      const codes: (string | undefined)[] = [];
      await Promise.resolve();
      codes.push(store.current()?.code);
      await new Promise((r) => setTimeout(r, 5));
      codes.push(store.current()?.code);
      codes.push(await Promise.resolve().then(() => store.current()?.code));
      return codes;
    });
    expect(seen).toEqual(['PER', 'PER', 'PER']);
  });

  it('keeps interleaved runs apart', async () => {
    const read = (ms: number) => new Promise<string | undefined>((r) => setTimeout(() => r(store.current()?.code), ms));
    const [a, b] = await Promise.all([
      store.run(scope('SYD'), () => read(15)),
      store.run(scope('PER'), () => read(5)),
    ]);
    expect([a, b]).toEqual(['SYD', 'PER']);
  });

  it('lets an inner run shadow the outer one, then restores it', () => {
    store.run(scope('SYD'), () => {
      expect(store.run(scope('PER'), () => store.current()?.code)).toBe('PER');
      expect(store.current()?.code).toBe('SYD');
    });
  });

  it('freezes the scope and its actor', () => {
    store.run(scope('SYD'), () => {
      const current = store.current()!;
      expect(Object.isFrozen(current)).toBe(true);
      expect(Object.isFrozen(current.actor)).toBe(true);
    });
  });
});
