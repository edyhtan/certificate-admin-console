import {
  Global,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { AppContext } from '../core/context/app-context.js';
import { HEALTH_PROBES } from '../health/health-probe.js';
import { PrismaHealthProbe } from '../health/prisma-health-probe.js';
import { TenantAppContext } from './tenant-app-context.js';
import { TenantClients } from './tenant-clients.js';
import { TenantMiddleware } from './tenant.middleware.js';
import { TenantScopeStore } from './tenant-scope.js';
import { TenantScopes } from './tenant-scopes.js';
import { TenantsController } from './tenants.controller.js';

/**
 * The only code that knows tenants exist (spec §5.1, D46): registry, one client per tenant,
 * the ambient tenant scope, the middleware that sets it, and AppContext bound to it.
 */
@Global()
@Module({
  controllers: [TenantsController],
  providers: [
    TenantClients,
    TenantScopeStore,
    TenantScopes,
    TenantAppContext,
    { provide: AppContext, useExisting: TenantAppContext },
    {
      // One check per tenant database, e.g. `database:SYD` (D50).
      provide: HEALTH_PROBES,
      useFactory: (clients: TenantClients) =>
        clients.entries().map(([code, client]) => new PrismaHealthProbe(`database:${code}`, client)),
      inject: [TenantClients],
    },
  ],
  exports: [AppContext, HEALTH_PROBES, TenantClients, TenantScopes],
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
