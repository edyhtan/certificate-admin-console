import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.js';
import { TenantDatabases, TenantNotSetUpError } from './tenant-databases.js';

const config = new AppConfig({
  apiPort: 3000,
  databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
  tenantDatabasePrefix: 'cert_test_x_1_',
});

/** Fake clients: `admin` is what `admin.findUnique` returns; `connect` can fail per URL. */
function setup(
  admin: { id: number; name: string } | null = { id: 1, name: 'Administrator' },
  connect: (url: string) => Promise<void> = async () => undefined,
) {
  const findUnique = vi.fn().mockResolvedValue(admin);
  const made: { url: string; client: Record<string, ReturnType<typeof vi.fn> | object> }[] = [];
  const factory = (url: string) => {
    const client = {
      $connect: vi.fn(() => connect(url)),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      admin: { findUnique },
    };
    made.push({ url, client });
    return client as unknown as PrismaClient;
  };
  return { databases: new TenantDatabases(config, factory), made, findUnique };
}

describe('TenantDatabases', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes one client per tenant, on that tenant’s database with a small pool', () => {
    const { databases, made } = setup();
    expect(made.map((m) => m.url)).toEqual([
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_syd?connection_limit=5',
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_per?connection_limit=5',
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_adl?connection_limit=5',
    ]);
    expect(databases.client('PER')).toBe(made[1].client);
    expect(databases.databaseOf('ADL')).toBe('cert_test_x_1_cert_adl');
  });

  it('connects on init (a down tenant is logged, not fatal) and disconnects on shutdown', async () => {
    const { databases, made } = setup(undefined, async (url) => {
      if (url.includes('cert_per')) throw new Error('Unknown database');
    });
    await expect(databases.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'tenant PER: database cert_test_x_1_cert_per not reachable at start-up: Unknown database',
    );
    await databases.onModuleDestroy();
    for (const m of made) expect(m.client.$disconnect).toHaveBeenCalledOnce();
  });

  it('opens a tenant: its client, registry timezone and admin actor', async () => {
    const { databases, made } = setup();
    await expect(databases.open('PER')).resolves.toEqual({
      code: 'PER',
      db: made[1].client,
      timeZone: 'Australia/Perth',
      actor: { id: 1, name: 'Administrator' },
    });
  });

  it('reads each tenant’s admin row once', async () => {
    const { databases, findUnique } = setup();
    await databases.open('SYD');
    await databases.open('SYD');
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('fails for a tenant with no admin row, and tries again next time', async () => {
    const { databases, findUnique } = setup(null);
    await expect(databases.open('ADL')).rejects.toBeInstanceOf(TenantNotSetUpError);
    await expect(databases.open('ADL')).rejects.toThrow('tenant ADL has no "admin" row');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
