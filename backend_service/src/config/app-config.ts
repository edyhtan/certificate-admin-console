import { z } from 'zod';

function isIanaTimeZone(value: string): boolean {
  // Fixed offsets such as "+10:00" are valid for Intl but never allowed here (spec §4 rule 2).
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string({ error: 'is required' })
    .startsWith('mysql://', { error: 'must be a mysql:// URL' }),
  DATABASE_URL_BASE: z
    .string({ error: 'is required' })
    .startsWith('mysql://', { error: 'must be a mysql:// URL' }),
  /** Test-only: prepended to every tenant database name, so test runs use their own databases. */
  TENANT_DATABASE_PREFIX: z
    .string()
    .regex(/^[a-z0-9_]*$/, { error: 'may only contain a-z, 0-9 and _' })
    .default(''),
  APP_TIMEZONE: z
    .string({ error: 'is required' })
    .refine(isIanaTimeZone, {
      error: 'must be an IANA time zone, e.g. Australia/Sydney',
    }),
  APP_SERIAL_PREFIX: z
    .string({ error: 'is required' })
    .regex(/^[A-Z]{3}$/, { error: 'must be 3 upper-case letters, e.g. SYD' }),
});

/** Typed, validated settings. Injected by class, so it doubles as the DI token. */
export class AppConfig {
  readonly apiPort: number;
  readonly databaseUrl: string;
  /** Server URL without a database; each tenant's database name is appended (spec §3.1). */
  readonly databaseUrlBase: string;
  /** Prepended to tenant database names. Empty except in tests. */
  readonly tenantDatabasePrefix: string;
  readonly timeZone: string;
  readonly serialPrefix: string;

  constructor(values: {
    apiPort: number;
    databaseUrl: string;
    databaseUrlBase: string;
    tenantDatabasePrefix?: string;
    timeZone: string;
    serialPrefix: string;
  }) {
    this.apiPort = values.apiPort;
    this.databaseUrl = values.databaseUrl;
    this.databaseUrlBase = values.databaseUrlBase;
    this.tenantDatabasePrefix = values.tenantDatabasePrefix ?? '';
    this.timeZone = values.timeZone;
    this.serialPrefix = values.serialPrefix;
    Object.freeze(this);
  }
}

/** Reads settings from environment variables. Throws one error that lists every problem. */
export function loadAppConfig(
  env: Record<string, string | undefined>,
): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')} ${issue.message}`,
    );
    throw new Error(
      `Invalid environment (see backend_service/.env.example):\n- ${problems.join('\n- ')}`,
    );
  }
  const e = result.data;
  return new AppConfig({
    apiPort: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    databaseUrlBase: e.DATABASE_URL_BASE,
    tenantDatabasePrefix: e.TENANT_DATABASE_PREFIX,
    timeZone: e.APP_TIMEZONE,
    serialPrefix: e.APP_SERIAL_PREFIX,
  });
}
