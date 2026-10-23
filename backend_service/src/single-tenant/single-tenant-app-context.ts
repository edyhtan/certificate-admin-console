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
  /** The load in progress, so concurrent callers share one query. */
  private loading: Promise<Actor | undefined> | undefined;
  /** The last problem logged, so retries don't log it again on every request. */
  private lastProblem: string | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly database: SingleTenantDatabase,
  ) {
    super();
  }

  /** Tries to load the actor. The app still starts without it, so health and setup can run. */
  async onApplicationBootstrap(): Promise<void> {
    await this.ensureActor();
  }

  /**
   * The actor, loading the `admin` row first if it isn't loaded yet. Resolves to undefined
   * while the row can't be loaded (database down, or not seeded yet) and tries again on the
   * next call, so the API recovers without a restart. Never rejects.
   */
  ensureActor(): Promise<Actor | undefined> {
    if (this.admin) return Promise.resolve(this.admin);
    this.loading ??= this.loadActor()
      .catch((error: unknown) => {
        this.reportProblem(
          `could not load the "${ADMIN_USERNAME}" row: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      })
      .finally(() => {
        this.loading = undefined;
      });
    return this.loading;
  }

  /** Reads the `admin` row; returns undefined when the database has none yet. */
  async loadActor(): Promise<Actor | undefined> {
    const row = await this.database.client.admin.findUnique({
      where: { username: ADMIN_USERNAME },
      select: { id: true, name: true },
    });
    this.admin = row ?? undefined;
    if (!row) {
      this.reportProblem(
        `no "${ADMIN_USERNAME}" row in the database yet; run npm run db:setup`,
      );
    } else if (this.lastProblem) {
      this.lastProblem = undefined;
      this.logger.log(`loaded the "${ADMIN_USERNAME}" row`);
    }
    return this.admin;
  }

  private reportProblem(message: string): void {
    if (message === this.lastProblem) return;
    this.lastProblem = message;
    this.logger.warn(message);
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
      // LoadActorInterceptor retries the load before every write, so no restart is needed.
      throw new Error(
        `no "${ADMIN_USERNAME}" row loaded; run npm run db:setup`,
      );
    }
    return this.admin;
  }

  now(): Date {
    return new Date();
  }
}
