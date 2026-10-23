import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.js';
import { TenantClients } from './tenant-clients.js';

const config = new AppConfig({
  apiPort: 3000,
  databaseUrl: 'mysql://root:root@127.0.0.1:3307/cert_syd',
  databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
  tenantDatabasePrefix: 'cert_test_x_1_',
  timeZone: 'Australia/Sydney',
  serialPrefix: 'SYD',
});

function fakeFactory(connect: (url: string) => Promise<void> = async () => undefined) {
  const made: { url: string; client: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> } }[] = [];
  const factory = (url: string) => {
    const client = { $connect: vi.fn(() => connect(url)), $disconnect: vi.fn().mockResolvedValue(undefined) };
    made.push({ url, client });
    return client as unknown as PrismaClient;
  };
  return { factory, made };
}

describe('TenantClients', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes one client per tenant, on that tenant’s database with a small pool', () => {
    const { factory, made } = fakeFactory();
    const clients = new TenantClients(config, factory);
    expect(made.map((m) => m.url)).toEqual([
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_syd?connection_limit=5',
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_per?connection_limit=5',
      'mysql://root:root@127.0.0.1:3307/cert_test_x_1_cert_adl?connection_limit=5',
    ]);
    expect(clients.entries().map(([code]) => code)).toEqual(['SYD', 'PER', 'ADL']);
    expect(clients.get('PER')).toBe(made[1].client);
    expect(clients.databaseOf('ADL')).toBe('cert_test_x_1_cert_adl');
  });

  it('connects every client on init and disconnects them on shutdown', async () => {
    const { factory, made } = fakeFactory();
    const clients = new TenantClients(config, factory);
    await clients.onModuleInit();
    for (const m of made) expect(m.client.$connect).toHaveBeenCalledOnce();
    await clients.onModuleDestroy();
    for (const m of made) expect(m.client.$disconnect).toHaveBeenCalledOnce();
  });

  it('starts when one tenant database is down, and logs which one', async () => {
    const { factory } = fakeFactory(async (url) => {
      if (url.includes('cert_per')) throw new Error('Unknown database');
    });
    const clients = new TenantClients(config, factory);
    await expect(clients.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      'tenant PER: database cert_test_x_1_cert_per not reachable at start-up: Unknown database',
    );
  });

  it('uses the registry names without a prefix outside tests', () => {
    const { factory, made } = fakeFactory();
    new TenantClients(new AppConfig({ ...config, tenantDatabasePrefix: '' }), factory);
    expect(made[0].url).toBe('mysql://root:root@127.0.0.1:3307/cert_syd?connection_limit=5');
  });

  it('throws for a code it has no client for', () => {
    const clients = new TenantClients(config, fakeFactory().factory);
    expect(() => clients.get('XYZ' as never)).toThrow('no client for tenant XYZ');
  });
});
