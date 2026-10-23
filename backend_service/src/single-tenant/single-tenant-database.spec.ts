import { Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { SingleTenantDatabase } from './single-tenant-database.js';

const config = new AppConfig({
  apiPort: 3000,
  databaseUrl: 'mysql://root:root@127.0.0.1:3307/cert_syd',
  databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
});

describe('SingleTenantDatabase', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('owns one Prisma client for the configured database', () => {
    // Prisma returns a proxy (not `instanceof PrismaClient`) that vitest can't print,
    // so check its API with plain booleans.
    const database = new SingleTenantDatabase(config);
    expect(typeof database.client.$queryRaw === 'function').toBe(true);
    expect(typeof database.client.admin.findUnique === 'function').toBe(true);
    expect(database.client === database.client).toBe(true);
  });

  it('connects on module init', async () => {
    const database = new SingleTenantDatabase(config);
    const connect = vi
      .spyOn(database.client, '$connect')
      .mockResolvedValue(undefined);
    await database.onModuleInit();
    expect(connect).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('still starts when the database is unreachable, and logs why', async () => {
    const database = new SingleTenantDatabase(config);
    vi.spyOn(database.client, '$connect').mockRejectedValue(
      new Error("Can't reach database server"),
    );
    await expect(database.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "database not reachable at start-up: Can't reach database server",
    );
  });

  it('disconnects on shutdown', async () => {
    const database = new SingleTenantDatabase(config);
    const disconnect = vi
      .spyOn(database.client, '$disconnect')
      .mockResolvedValue(undefined);
    await database.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
