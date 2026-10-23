import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/app-config.js';

/** The one database of the M1-M2 single-tenant setup (D43, D48). */
@Injectable()
export class SingleTenantDatabase implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SingleTenantDatabase.name);
  readonly client: PrismaClient;

  constructor(config: AppConfig) {
    this.client = new PrismaClient({ datasourceUrl: config.databaseUrl });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
    } catch (error) {
      // Start anyway: the health check reports the database as down, and Prisma
      // reconnects on the next query once the database is back.
      this.logger.warn(
        `database not reachable at start-up: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
