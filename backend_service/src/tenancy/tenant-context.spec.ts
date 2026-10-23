import { Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ClsModule } from 'nestjs-cls';
import { AppContext } from '../core/context/app-context.js';
import { TenantAppContextModule, TenantContext } from './tenant-context.js';
import { TenantDatabases, TenantNotSetUpError } from './tenant-databases.js';
import { TENANTS, type TenantCode } from './tenants.js';

/** Shaped like a core service: a singleton holding the injected AppContext proxy. */
@Injectable()
class SampleCoreService {
  constructor(readonly ctx: AppContext) {}
  where() {
    return { prefix: this.ctx.serialPrefix, timeZone: this.ctx.timeZone, actor: this.ctx.actor.name };
  }
}

const dbs = { SYD: { tag: 'syd' }, PER: { tag: 'per' }, ADL: { tag: 'adl' } };
const open = vi.fn(async (code: TenantCode) => {
  if (code === 'ADL') throw new TenantNotSetUpError('ADL');
  return { code, db: dbs[code] as unknown as PrismaClient, timeZone: TENANTS[code].timezone, actor: { id: 1, name: `${code} admin` } };
});

@Module({ providers: [{ provide: TenantDatabases, useValue: { open } }], exports: [TenantDatabases] })
class FakeDatabasesModule {}

describe('TenantContext and the AppContext proxy', () => {
  let moduleRef: TestingModule;
  let context: TenantContext;
  let service: SampleCoreService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        { module: FakeDatabasesModule, global: true },
        ClsModule.forRoot({ global: true }),
        TenantAppContextModule,
      ],
      providers: [TenantContext, SampleCoreService],
    }).compile();
    await moduleRef.init(); // nestjs-cls registers proxy providers on module init
    context = moduleRef.get(TenantContext);
    service = moduleRef.get(SampleCoreService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('gives a singleton service the current tenant through the proxy', async () => {
    await expect(context.run('PER', () => service.where())).resolves.toEqual({
      prefix: 'PER',
      timeZone: 'Australia/Perth',
      actor: 'PER admin',
    });
    expect(open).toHaveBeenLastCalledWith('PER');
  });

  it('passes the tenant’s own database client through', async () => {
    await expect(context.run('SYD', () => service.ctx.db)).resolves.toBe(dbs.SYD);
  });

  it('throws outside any tenant context (strict proxy, no default tenant)', () => {
    expect(() => service.where()).toThrow();
  });

  it('keeps each run’s tenant across awaits, even when runs interleave', async () => {
    const later = (ms: number) => new Promise<string>((r) => setTimeout(() => r(service.ctx.serialPrefix), ms));
    const [a, b] = await Promise.all([context.run('SYD', () => later(15)), context.run('PER', () => later(5))]);
    expect([a, b]).toEqual(['SYD', 'PER']);
  });

  it('rejects, without running fn, when the tenant can’t be opened', async () => {
    const fn = vi.fn();
    await expect(context.run('ADL', fn)).rejects.toBeInstanceOf(TenantNotSetUpError);
    expect(fn).not.toHaveBeenCalled();
  });
});
