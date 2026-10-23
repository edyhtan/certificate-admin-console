import { PrismaClient } from '@prisma/client';

/** A tenant database found on the MySQL server. */
export interface DiscoveredTenant {
  /** Tenant code, e.g. `SYD`: the database name without `cert_`, upper-cased. */
  code: string;
  name: string;
  /** IANA zone used to show dates. `UTC` when the code isn't known yet. */
  timeZone: string;
  /** False when the code isn't in KNOWN_TENANTS, so dates are shown in UTC. */
  known: boolean;
  database: string;
}

/**
 * Names and zones for tenant codes (spec §3.1, D35). M3 adds the tenant registry
 * (`src/tenancy/tenants.ts`); this map should then be replaced by an import of it.
 */
export const KNOWN_TENANTS: Readonly<
  Record<string, { name: string; timeZone: string }>
> = {
  SYD: { name: 'Sydney', timeZone: 'Australia/Sydney' },
  PER: { name: 'Perth', timeZone: 'Australia/Perth' },
  ADL: { name: 'Adelaide', timeZone: 'Australia/Adelaide' },
};

/** `cert_` + 3 letters is a tenant database. `cert_test_…` (test harness) never matches. */
const TENANT_DATABASE = /^cert_([a-z]{3})$/;

/** The tenant for a database name, or undefined when it isn't a tenant database. */
export function tenantFromDatabase(
  database: string,
): DiscoveredTenant | undefined {
  const match = TENANT_DATABASE.exec(database);
  if (!match) return undefined;
  const code = match[1].toUpperCase();
  const known = KNOWN_TENANTS[code];
  return {
    code,
    name: known?.name ?? code,
    timeZone: known?.timeZone ?? 'UTC',
    known: Boolean(known),
    database,
  };
}

/** Tenants for a list of database names, sorted by code. Other databases are left out. */
export function toTenants(databases: readonly string[]): DiscoveredTenant[] {
  return databases
    .map(tenantFromDatabase)
    .filter((t): t is DiscoveredTenant => t !== undefined)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Databases on the server that have the app's schema (a `certificate` table).
 * Includes test databases; `toTenants` filters those out.
 */
export async function listSchemaDatabases(
  server: PrismaClient,
): Promise<string[]> {
  const rows = await server.$queryRaw<{ name: string }[]>`
    SELECT table_schema AS name FROM information_schema.tables
    WHERE table_name = 'certificate' AND table_type = 'BASE TABLE'
    ORDER BY table_schema`;
  return rows.map((r) => r.name);
}

/** Tenant databases currently on the server. */
export async function discoverTenants(
  server: PrismaClient,
): Promise<DiscoveredTenant[]> {
  return toTenants(await listSchemaDatabases(server));
}

/**
 * The server URL without a database, from `DATABASE_URL_BASE`, or else the server part of
 * `DATABASE_URL`.
 */
export function serverUrlFromEnv(
  env: Record<string, string | undefined>,
): string {
  const base = env.DATABASE_URL_BASE ?? env.DATABASE_URL;
  if (!base?.startsWith('mysql://')) {
    throw new Error(
      'Set DATABASE_URL_BASE (or DATABASE_URL) to a mysql:// URL in backend_service/.env',
    );
  }
  const url = new URL(base);
  url.pathname = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}
