import {
  KNOWN_TENANTS,
  serverUrlFromEnv,
  tenantFromDatabase,
  toTenants,
} from './tenants.js';

describe('tenantFromDatabase', () => {
  it('maps cert_syd to the Sydney tenant', () => {
    expect(tenantFromDatabase('cert_syd')).toEqual({
      code: 'SYD',
      name: 'Sydney',
      timeZone: 'Australia/Sydney',
      known: true,
      database: 'cert_syd',
    });
  });

  it('knows Perth and Adelaide (the M3 tenants)', () => {
    expect(tenantFromDatabase('cert_per')?.timeZone).toBe('Australia/Perth');
    expect(tenantFromDatabase('cert_adl')?.timeZone).toBe('Australia/Adelaide');
  });

  it('accepts an unknown 3-letter code but shows its dates in UTC', () => {
    expect(tenantFromDatabase('cert_mel')).toEqual({
      code: 'MEL',
      name: 'MEL',
      timeZone: 'UTC',
      known: false,
      database: 'cert_mel',
    });
  });

  it.each([
    'cert_test_mh3k2a_1234', // test harness database
    'cert_sydney',
    'cert_sy',
    'cert_sy1',
    'CERT_SYD',
    'syd',
    'mysql',
    'information_schema',
  ])('ignores %s', (name) => {
    expect(tenantFromDatabase(name)).toBeUndefined();
  });

  it('uses IANA zones only, never fixed offsets', () => {
    for (const { timeZone } of Object.values(KNOWN_TENANTS)) {
      expect(timeZone).toMatch(/^Australia\//);
      expect(() => new Intl.DateTimeFormat('en', { timeZone })).not.toThrow();
    }
  });
});

describe('toTenants', () => {
  it('keeps tenant databases only, sorted by code', () => {
    const tenants = toTenants(['cert_syd', 'cert_test_abc_1', 'cert_adl', 'mysql', 'cert_per']);
    expect(tenants.map((t) => t.code)).toEqual(['ADL', 'PER', 'SYD']);
  });

  it('returns an empty list when there are none', () => {
    expect(toTenants([])).toEqual([]);
    expect(toTenants(['cert_test_abc_1'])).toEqual([]);
  });
});

describe('serverUrlFromEnv', () => {
  it('prefers DATABASE_URL_BASE', () => {
    expect(
      serverUrlFromEnv({
        DATABASE_URL_BASE: 'mysql://root:root@127.0.0.1:3307/',
        DATABASE_URL: 'mysql://x:y@other:1/cert_syd',
      }),
    ).toBe('mysql://root:root@127.0.0.1:3307');
  });

  it('falls back to the server part of DATABASE_URL', () => {
    expect(
      serverUrlFromEnv({ DATABASE_URL: 'mysql://root:root@127.0.0.1:3307/cert_syd?connection_limit=5' }),
    ).toBe('mysql://root:root@127.0.0.1:3307');
  });

  it('fails clearly without a mysql:// URL', () => {
    expect(() => serverUrlFromEnv({})).toThrow(/DATABASE_URL_BASE/);
    expect(() => serverUrlFromEnv({ DATABASE_URL: 'postgres://x' })).toThrow(/mysql:\/\//);
  });
});
