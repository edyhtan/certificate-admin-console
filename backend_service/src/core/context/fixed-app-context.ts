import type { PrismaClient } from '@prisma/client';
import { AppContext, type Actor } from './app-context.js';

export interface FixedAppContextValues {
  db: PrismaClient;
  timeZone: string;
  serialPrefix: string;
  actor: Actor;
  /** Defaults to the real clock. */
  now?: () => Date;
}

/** An AppContext with fixed values: for unit tests, e2e tests and scripts. */
export class FixedAppContext extends AppContext {
  private readonly values: Readonly<FixedAppContextValues>;

  constructor(values: FixedAppContextValues) {
    super();
    this.values = Object.freeze({ ...values });
  }

  get db(): PrismaClient {
    return this.values.db;
  }

  get timeZone(): string {
    return this.values.timeZone;
  }

  get serialPrefix(): string {
    return this.values.serialPrefix;
  }

  get actor(): Actor {
    return this.values.actor;
  }

  now(): Date {
    return this.values.now ? this.values.now() : new Date();
  }
}
