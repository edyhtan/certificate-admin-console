import type { PrismaClient } from '@prisma/client';

export interface Actor {
  id: number;
  name: string;
}

/**
 * Everything the business code needs to know about where it is running (spec §5.1, D46).
 * Owned by the core and has no notion of "tenant": the core sees one organisation with one
 * database. Core services inject it and read it when called; they never cache its values,
 * because services are singletons that outlive requests.
 *
 * Bound by the single-tenant module in M1-M2 and by the tenancy module from M3.
 */
export abstract class AppContext {
  /** The database to work with. Inside a transaction, use the `tx` argument instead. */
  abstract get db(): PrismaClient;
  /** IANA zone for displayed dates and the serial year, e.g. `Australia/Sydney`. */
  abstract get timeZone(): string;
  /** Start of every serial number, e.g. `SYD`. */
  abstract get serialPrefix(): string;
  /** Who is acting: the database's `admin` row (no auth). */
  abstract get actor(): Actor;
  /** The current instant. Tests bind a fixed clock. */
  abstract now(): Date;
}
