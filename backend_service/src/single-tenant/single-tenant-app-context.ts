import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.js';
import { AppContext, type Actor } from '../core/context/app-context.js';
import { SingleTenantDatabase } from './single-tenant-database.js';

export const ADMIN_USERNAME = 'admin';

/**
 * M1-M2 binding of AppContext: one database, timezone and serial prefix from env (Sydney, D48),
 * actor = that database's `admin` row. M3 replaces it with the tenancy module's TenantAppContext.
 */
@Injectable()
export class SingleTenantAppContext
  extends AppContext
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(SingleTenantAppContext.name);
  private admin: Actor | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly database: SingleTenantDatabase,
  ) {
    super();
  }

  /** Loads the actor once. The app still starts without it, so health and setup can run. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.loadActor();
    } catch (error) {
      this.logger.warn(
        `could not load the "${ADMIN_USERNAME}" row: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Reads the `admin` row; returns undefined when the database has none yet. */
  async loadActor(): Promise<Actor | undefined> {
    const row = await this.database.client.admin.findUnique({
      where: { username: ADMIN_USERNAME },
      select: { id: true, name: true },
    });
    this.admin = row ?? undefined;
    if (!row) {
      this.logger.warn(
        `no "${ADMIN_USERNAME}" row in the database yet; run npm run db:setup`,
      );
    }
    return this.admin;
  }

  get db(): PrismaClient {
    return this.database.client;
  }

  get timeZone(): string {
    return this.config.timeZone;
  }

  get serialPrefix(): string {
    return this.config.serialPrefix;
  }

  get actor(): Actor {
    if (!this.admin) {
      // Fail closed: never write audit rows or certificates without a known actor.
      throw new Error(
        `no "${ADMIN_USERNAME}" row loaded; run npm run db:setup and restart the API`,
      );
    }
    return this.admin;
  }

  now(): Date {
    return new Date();
  }
}
