/**
 * The tenant registry (spec §3.1, D27). Server only: it holds database names.
 * The code is the tenant's one identifier: the `tenant_id` header value, the key here, and the
 * serial prefix. Adding a tenant = adding an entry here and re-running `npm run db:setup`.
 */
export const TENANTS = {
  SYD: { name: 'Sydney', timezone: 'Australia/Sydney', database: 'cert_syd' },
  PER: { name: 'Perth', timezone: 'Australia/Perth', database: 'cert_per' },
  ADL: { name: 'Adelaide', timezone: 'Australia/Adelaide', database: 'cert_adl' },
} as const satisfies Record<string, { name: string; timezone: string; database: string }>;

export type TenantCode = keyof typeof TENANTS;
export type TenantEntry = (typeof TENANTS)[TenantCode];

export const TENANT_CODES = Object.keys(TENANTS) as TenantCode[];

/** Exact match against the registry: `SYD` yes; `syd`, ` SYD`, `XYZ`, `toString` no (spec §3.1). */
export function isTenantCode(value: unknown): value is TenantCode {
  return typeof value === 'string' && Object.hasOwn(TENANTS, value);
}

/** The tenant's database name, with the optional prefix tests use for throwaway databases. */
export function tenantDatabaseName(code: TenantCode, prefix = ''): string {
  return `${prefix}${TENANTS[code].database}`;
}

/** Connections per tenant client. Three tenants share one MySQL server (default 151 connections). */
export const TENANT_CONNECTION_LIMIT = 5;

/**
 * `DATABASE_URL_BASE` + database name, with a small pool: e.g.
 * `mysql://root:root@127.0.0.1:3307` + `cert_syd` → `mysql://root:root@127.0.0.1:3307/cert_syd?connection_limit=5`.
 * Existing query parameters on the base are kept.
 */
export function tenantDatabaseUrl(
  base: string,
  database: string,
  connectionLimit = TENANT_CONNECTION_LIMIT,
): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  url.searchParams.set('connection_limit', String(connectionLimit));
  return url.toString();
}
