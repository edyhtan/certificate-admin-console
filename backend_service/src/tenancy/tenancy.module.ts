import {
  Global,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { HEALTH_PROBES, type HealthProbe } from '../health/health-probe.js';
import { PrismaHealthProbe } from '../health/prisma-health-probe.js';
import { TenantAppContextModule, TenantContext } from './tenant-context.js';
import { TenantDatabases } from './tenant-databases.js';
import { TenantMiddleware } from './tenant.middleware.js';
import { TenantsController } from './tenants.controller.js';

/**
 * The only code that knows tenants exist (spec §5.1), in three layers:
 * 1. Mounting: `TenantMiddleware` on every route except `GET /api/tenants` and `GET /api/health`.
 * 2. Tenant → database: `TenantDatabases` (registry in `tenants.ts`).
 * 3. Singleton injection: `AppContext` as a nestjs-cls proxy provider (`tenant-context.ts`).
 */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true }), TenantAppContextModule],
  controllers: [TenantsController],
  providers: [
    TenantDatabases,
    TenantContext,
    {
      // Per tenant: its database answers (D50) and its admin actor loads (D61), so health is 503
      // while any tenant can't take writes.
      provide: HEALTH_PROBES,
      useFactory: (databases: TenantDatabases): HealthProbe[] =>
        databases.entries().flatMap(([code, client]) => [
          new PrismaHealthProbe(`database:${code}`, client),
          { name: `admin:${code}`, check: async () => void (await databases.open(code)) },
        ]),
      inject: [TenantDatabases],
    },
  ],
  exports: [HEALTH_PROBES, TenantDatabases, TenantContext],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'tenants', method: RequestMethod.GET },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
