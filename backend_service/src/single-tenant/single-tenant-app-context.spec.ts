import { Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { AppContext } from '../core/context/app-context.js';
import { SingleTenantAppContext } from './single-tenant-app-context.js';
import type { SingleTenantDatabase } from './single-tenant-database.js';

const config = new AppConfig({
  apiPort: 3000,
  databaseUrl: 'mysql://root:root@127.0.0.1:3307/cert_syd',
  databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
});

function databaseWith(findUnique: ReturnType<typeof vi.fn>) {
  const client = { admin: { findUnique } };
  return { client } as unknown as SingleTenantDatabase;
}

describe('SingleTenantAppContext', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is an AppContext with the database, timezone and prefix from config', () => {
    const database = databaseWith(vi.fn());
    const ctx = new SingleTenantAppContext(config, database);
    expect(ctx).toBeInstanceOf(AppContext);
    expect(ctx.db).toBe(database.client);
    expect(ctx.timeZone).toBe('Australia/Sydney');
    expect(ctx.serialPrefix).toBe('SYD');
  });

  it('loads the admin row as the actor at start-up', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 1, name: 'Administrator' });
    const ctx = new SingleTenantAppContext(config, databaseWith(findUnique));
    await ctx.onApplicationBootstrap();
    expect(findUnique).toHaveBeenCalledWith({
      where: { username: 'admin' },
      select: { id: true, name: true },
    });
    expect(ctx.actor).toEqual({ id: 1, name: 'Administrator' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('starts without an admin row but refuses to give an actor', async () => {
    const ctx = new SingleTenantAppContext(
      config,
      databaseWith(vi.fn().mockResolvedValue(null)),
    );
    await ctx.onApplicationBootstrap();
    expect(warn).toHaveBeenCalledWith(
      'no "admin" row in the database yet; run npm run db:setup',
    );
    expect(() => ctx.actor).toThrow(/no "admin" row loaded; run npm run db:setup/);
  });

  it('starts when the database is down, and logs why', async () => {
    const ctx = new SingleTenantAppContext(
      config,
      databaseWith(vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))),
    );
    await expect(ctx.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'could not load the "admin" row: ECONNREFUSED',
    );
    expect(() => ctx.actor).toThrow(/no "admin" row loaded/);
  });

  it('picks up the admin row when it is loaded again', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, name: 'Administrator' });
    const ctx = new SingleTenantAppContext(config, databaseWith(findUnique));
    await ctx.onApplicationBootstrap();
    await expect(ctx.loadActor()).resolves.toEqual({
      id: 1,
      name: 'Administrator',
    });
    expect(ctx.actor.name).toBe('Administrator');
  });

  it('reads the real clock', () => {
    const ctx = new SingleTenantAppContext(config, databaseWith(vi.fn()));
    const before = Date.now();
    expect(ctx.now().getTime()).toBeGreaterThanOrEqual(before);
  });
});
