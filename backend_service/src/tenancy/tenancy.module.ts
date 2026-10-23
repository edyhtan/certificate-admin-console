import { Global, Module } from '@nestjs/common';
import { TenantClients } from './tenant-clients.js';

/**
 * The only code that knows tenants exist (spec §5.1). M3.T1: the registry and one Prisma client
 * per tenant. M3.T2 adds the tenant scope, middleware, TenantAppContext and `GET /api/tenants`.
 */
@Global()
@Module({
  providers: [TenantClients],
  exports: [TenantClients],
})
export class TenancyModule {}
