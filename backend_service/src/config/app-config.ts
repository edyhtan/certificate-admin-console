import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL_BASE: z
    .string({ error: 'is required' })
    .startsWith('mysql://', { error: 'must be a mysql:// URL' }),
  /** Test-only: prepended to every tenant database name, so test runs use their own databases. */
  TENANT_DATABASE_PREFIX: z
    .string()
    .regex(/^[a-z0-9_]*$/, { error: 'may only contain a-z, 0-9 and _' })
    .default(''),
});

/**
 * Typed, validated settings. Injected by class, so it doubles as the DI token.
 * Per-tenant values (database, timezone, serial prefix) come from the tenant registry (spec §3.1).
 */
export class AppConfig {
  readonly apiPort: number;
  /** Server URL without a database; each tenant's database name is appended (spec §3.1). */
  readonly databaseUrlBase: string;
  /** Prepended to tenant database names. Empty except in tests. */
  readonly tenantDatabasePrefix: string;

  constructor(values: { apiPort: number; databaseUrlBase: string; tenantDatabasePrefix?: string }) {
    this.apiPort = values.apiPort;
    this.databaseUrlBase = values.databaseUrlBase;
    this.tenantDatabasePrefix = values.tenantDatabasePrefix ?? '';
    Object.freeze(this);
  }
}

/** Reads settings from environment variables. Throws one error that lists every problem. */
export function loadAppConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
    throw new Error(
      `Invalid environment (see backend_service/.env.example):\n- ${problems.join('\n- ')}`,
    );
  }
  const e = result.data;
  return new AppConfig({
    apiPort: e.API_PORT,
    databaseUrlBase: e.DATABASE_URL_BASE,
    tenantDatabasePrefix: e.TENANT_DATABASE_PREFIX,
  });
}
