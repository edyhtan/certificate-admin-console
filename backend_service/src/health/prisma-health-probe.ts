import type { PrismaClient } from '@prisma/client';
import { HealthProbe } from './health-probe.js';

/** Up when the database answers `SELECT 1`. */
export class PrismaHealthProbe extends HealthProbe {
  constructor(
    readonly name: string,
    private readonly db: PrismaClient,
  ) {
    super();
  }

  async check(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }
}
