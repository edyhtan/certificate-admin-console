import { Injectable } from '@nestjs/common';
import { ClsModule, ClsService } from 'nestjs-cls';
import { AppContext } from '../core/context/app-context.js';
import { FixedAppContext } from '../core/context/fixed-app-context.js';
import { TenantDatabases } from './tenant-databases.js';
import type { TenantCode } from './tenants.js';

/** CLS key holding the current request's tenant code. */
export const TENANT_CODE = 'tenantCode';

/**
 * Layer 3, singleton injection (D64): `AppContext` is a nestjs-cls proxy provider. Core services
 * inject it once, as a singleton; each property access goes through the proxy to the context
 * resolved for the current CLS context, i.e. the current tenant. `strict`: with no resolved
 * context it throws (no default tenant).
 */
export const TenantAppContextModule = ClsModule.forFeatureAsync({
  provide: AppContext,
  inject: [ClsService, TenantDatabases],
  strict: true,
  global: true,
  useFactory: async (cls: ClsService, databases: TenantDatabases): Promise<AppContext> => {
    const scope = await databases.open(cls.get(TENANT_CODE));
    return new FixedAppContext({
      db: scope.db,
      timeZone: scope.timeZone,
      serialPrefix: scope.code,
      actor: scope.actor,
    });
  },
});

/** Runs code as a tenant: a request (from the middleware), or a script or test. */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  /**
   * Opens a CLS context for `code`, resolves the `AppContext` proxy for it (this opens the
   * tenant's database and loads its actor), then runs `fn` inside. Everything `fn` starts
   * (awaits, timers, streams) keeps that tenant. Rejects if the tenant can't be opened.
   */
  run<T>(code: TenantCode, fn: () => T | Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set(TENANT_CODE, code);
      await this.cls.proxy.resolve();
      return fn();
    });
  }
}
