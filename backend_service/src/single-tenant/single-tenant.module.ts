import { Global, Module } from '@nestjs/common';
import { AppContext } from '../core/context/app-context.js';
import { HEALTH_PROBES } from '../health/health-probe.js';
import { PrismaHealthProbe } from '../health/prisma-health-probe.js';
import { SingleTenantAppContext } from './single-tenant-app-context.js';
import { SingleTenantDatabase } from './single-tenant-database.js';

/**
 * M1-M2 only: binds AppContext to one database (D43). M3 swaps this module for the
 * tenancy module; core modules don't change.
 */
@Global()
@Module({
  providers: [
    SingleTenantDatabase,
    SingleTenantAppContext,
    { provide: AppContext, useExisting: SingleTenantAppContext },
    {
      provide: HEALTH_PROBES,
      useFactory: (database: SingleTenantDatabase) => [
        new PrismaHealthProbe('database', database.client),
      ],
      inject: [SingleTenantDatabase],
    },
  ],
  exports: [AppContext, HEALTH_PROBES],
})
export class SingleTenantModule {}
