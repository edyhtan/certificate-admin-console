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
import { TenantAdminProbe } from './tenant-admin-probe.js';
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
      // Per tenant: its database answers (`database:SYD`, D50) and its admin actor loads
      // (`admin:SYD`, D61), so health is 503 while any tenant can't take writes.
      provide: HEALTH_PROBES,
      useFactory: (clients: TenantClients, scopes: TenantScopes) =>
        clients
          .entries()
          .flatMap(([code, client]) => [
            new PrismaHealthProbe(`database:${code}`, client),
            new TenantAdminProbe(scopes, code),
          ]),
      inject: [TenantClients, TenantScopes],
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
