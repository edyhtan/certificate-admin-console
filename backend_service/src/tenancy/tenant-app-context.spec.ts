import type { PrismaClient } from '@prisma/client';
import { AppContext } from '../core/context/app-context.js';
import { NoTenantScopeError, TenantAppContext } from './tenant-app-context.js';
import { TenantScopeStore } from './tenant-scope.js';

describe('TenantAppContext', () => {
  const store = new TenantScopeStore();
  const ctx = new TenantAppContext(store);
  const db = { tag: 'adl' } as unknown as PrismaClient;

  it('is an AppContext', () => {
    expect(ctx).toBeInstanceOf(AppContext);
  });

  it('reads db, timezone, prefix and actor from the current scope', () => {
    store.run(
      { code: 'ADL', db, timeZone: 'Australia/Adelaide', actor: { id: 1, name: 'Administrator' } },
      () => {
        expect(ctx.db).toBe(db);
        expect(ctx.timeZone).toBe('Australia/Adelaide');
        expect(ctx.serialPrefix).toBe('ADL');
        expect(ctx.actor).toEqual({ id: 1, name: 'Administrator' });
      },
    );
  });

  it('throws on every getter outside any scope (fail closed, no default tenant)', () => {
    for (const getter of ['db', 'timeZone', 'serialPrefix', 'actor'] as const) {
      expect(() => ctx[getter], getter).toThrow(NoTenantScopeError);
    }
  });

  it('reads the real clock, with or without a scope', () => {
    const before = Date.now();
    expect(ctx.now().getTime()).toBeGreaterThanOrEqual(before);
  });
});
