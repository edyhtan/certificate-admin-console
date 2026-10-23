import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.js';
import {
  TENANT_CODES,
  tenantDatabaseName,
  tenantDatabaseUrl,
  type TenantCode,
} from './tenants.js';

/** How clients are made; tests swap it to avoid real connections. */
export type PrismaClientFactory = (datasourceUrl: string) => PrismaClient;
export const PRISMA_CLIENT_FACTORY = Symbol('PRISMA_CLIENT_FACTORY');

const defaultFactory: PrismaClientFactory = (datasourceUrl) => new PrismaClient({ datasourceUrl });

/**
 * One PrismaClient per registry tenant, each pointed at that tenant's database with a small pool
 * (spec §5.1, D33). Connects on module init and disconnects on shutdown. Only the tenancy module
 * uses it; core code gets its client through AppContext.
 */
@Injectable()
export class TenantClients implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantClients.name);
  private readonly clients = new Map<TenantCode, PrismaClient>();
  private readonly databases = new Map<TenantCode, string>();

  constructor(
    config: AppConfig,
    @Optional() @Inject(PRISMA_CLIENT_FACTORY) factory?: PrismaClientFactory,
  ) {
    const make = factory ?? defaultFactory;
    for (const code of TENANT_CODES) {
      const database = tenantDatabaseName(code, config.tenantDatabasePrefix);
      this.databases.set(code, database);
      this.clients.set(code, make(tenantDatabaseUrl(config.databaseUrlBase, database)));
    }
  }

  /** The client for a registry tenant. */
  get(code: TenantCode): PrismaClient {
    const client = this.clients.get(code);
    if (!client) throw new Error(`no client for tenant ${code}`);
    return client;
  }

  /** The database a tenant's client points at (with any test prefix). */
  databaseOf(code: TenantCode): string {
    return this.databases.get(code) ?? '';
  }

  /** Every tenant with its client, in registry order. */
  entries(): [TenantCode, PrismaClient][] {
    return [...this.clients];
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.entries().map(async ([code, client]) => {
        try {
          await client.$connect();
        } catch (error) {
          // Start anyway: the health check reports that tenant's database as down, and Prisma
          // reconnects on the next query once it is back.
          this.logger.warn(
            `tenant ${code}: database ${this.databaseOf(code)} not reachable at start-up: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.entries().map(([, client]) => client.$disconnect()));
  }
}
