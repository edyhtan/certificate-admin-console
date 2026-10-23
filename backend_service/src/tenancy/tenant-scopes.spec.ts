import type { PrismaClient } from '@prisma/client';
import type { TenantClients } from './tenant-clients.js';
import { TenantScopeStore } from './tenant-scope.js';
import { TenantNotSetUpError, TenantScopes } from './tenant-scopes.js';

function setup(admin: { id: number; name: string } | null = { id: 1, name: 'Administrator' }) {
  const findUnique = vi.fn().mockResolvedValue(admin);
  const dbs = {
    SYD: { admin: { findUnique } },
    PER: { admin: { findUnique } },
    ADL: { admin: { findUnique } },
  };
  const clients = { get: vi.fn((code: keyof typeof dbs) => dbs[code] as unknown as PrismaClient) };
  const store = new TenantScopeStore();
  return { scopes: new TenantScopes(clients as unknown as TenantClients, store), store, findUnique, dbs };
}

describe('TenantScopes', () => {
  it('builds a scope from the tenant’s client, registry timezone and admin row', async () => {
    const { scopes, findUnique, dbs } = setup();
    await expect(scopes.scopeFor('PER')).resolves.toEqual({
      code: 'PER',
      db: dbs.PER,
      timeZone: 'Australia/Perth',
      actor: { id: 1, name: 'Administrator' },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { username: 'admin' },
      select: { id: true, name: true },
    });
  });

  it('reads each tenant’s admin row once', async () => {
    const { scopes, findUnique } = setup();
    await scopes.scopeFor('SYD');
    await scopes.scopeFor('SYD');
    await scopes.scopeFor('ADL');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('fails for a tenant database with no admin row, and tries again next time', async () => {
    const { scopes, findUnique } = setup(null);
    await expect(scopes.scopeFor('ADL')).rejects.toBeInstanceOf(TenantNotSetUpError);
    await expect(scopes.scopeFor('ADL')).rejects.toThrow(
      'tenant ADL has no "admin" row; run npm run db:setup',
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('runs code inside a tenant scope and returns its result', async () => {
    const { scopes, store } = setup();
    const result = await scopes.runInTenant('PER', async () => {
      await Promise.resolve();
      return store.current()?.code;
    });
    expect(result).toBe('PER');
    expect(store.current()).toBeUndefined();
  });
});
