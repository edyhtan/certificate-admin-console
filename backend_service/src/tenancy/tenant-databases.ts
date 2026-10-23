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
import type { Actor } from '../core/context/app-context.js';
import {
  TENANT_CODES,
  tenantDatabaseName,
  tenantDatabaseUrl,
  TENANTS,
  type TenantCode,
} from './tenants.js';

/** Everything that differs per tenant: what the middleware puts in the request's context. */
export interface TenantScope {
  readonly code: TenantCode;
  readonly db: PrismaClient;
  readonly timeZone: string;
  readonly actor: Readonly<Actor>;
}

export const ADMIN_USERNAME = 'admin';

/** The tenant database has no `admin` row: it hasn't been set up. */
export class TenantNotSetUpError extends Error {
  constructor(readonly code: TenantCode) {
    super(`tenant ${code} has no "${ADMIN_USERNAME}" row; run npm run db:setup`);
    this.name = 'TenantNotSetUpError';
  }
}

/** How clients are made; tests swap it to avoid real connections. */
export type PrismaClientFactory = (datasourceUrl: string) => PrismaClient;
export const PRISMA_CLIENT_FACTORY = Symbol('PRISMA_CLIENT_FACTORY');

/**
 * Layer 2, tenant → database (spec §3.1, §5.1): one PrismaClient per registry tenant, each on its
 * own database with a small pool, and `open(code)` to turn a tenant code into its scope.
 */
@Injectable()
export class TenantDatabases implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantDatabases.name);
  private readonly clients = new Map<TenantCode, PrismaClient>();
  private readonly names = new Map<TenantCode, string>();
  /** The admin row never changes once set up, so it is read once per tenant (retried until found). */
  private readonly actors = new Map<TenantCode, Actor>();

  constructor(
    config: AppConfig,
    @Optional() @Inject(PRISMA_CLIENT_FACTORY) factory?: PrismaClientFactory,
  ) {
    const make = factory ?? ((url: string) => new PrismaClient({ datasourceUrl: url }));
    for (const code of TENANT_CODES) {
      const name = tenantDatabaseName(code, config.tenantDatabasePrefix);
      this.names.set(code, name);
      this.clients.set(code, make(tenantDatabaseUrl(config.databaseUrlBase, name)));
    }
  }

  /** The client for a registry tenant. */
  client(code: TenantCode): PrismaClient {
    const client = this.clients.get(code);
    if (!client) throw new Error(`no database for tenant ${code}`);
    return client;
  }

  /** The database a tenant's client points at (with any test prefix). */
  databaseOf(code: TenantCode): string {
    return this.names.get(code) ?? '';
  }

  /** Every tenant with its client, in registry order. */
  entries(): [TenantCode, PrismaClient][] {
    return [...this.clients];
  }

  /** The tenant's scope: its client, registry timezone and `admin` actor. */
  async open(code: TenantCode): Promise<TenantScope> {
    const db = this.client(code);
    let actor = this.actors.get(code);
    if (!actor) {
      const row = await db.admin.findUnique({
        where: { username: ADMIN_USERNAME },
        select: { id: true, name: true },
      });
      if (!row) throw new TenantNotSetUpError(code);
      actor = row;
      this.actors.set(code, actor);
    }
    return { code, db, timeZone: TENANTS[code].timezone, actor };
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.entries().map(async ([code, client]) => {
        try {
          await client.$connect();
        } catch (error) {
          // Start anyway: health reports that tenant as down, and Prisma reconnects on the next query.
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
