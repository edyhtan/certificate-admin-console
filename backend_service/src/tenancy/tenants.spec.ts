import { tenantCodeSchema } from '@cert/shared';
import {
  isTenantCode,
  TENANT_CODES,
  tenantDatabaseName,
  tenantDatabaseUrl,
  TENANTS,
} from './tenants.js';

describe('tenant registry', () => {
  it('lists Sydney, Perth and Adelaide with their zones and databases (D35)', () => {
    expect(TENANTS).toEqual({
      SYD: { name: 'Sydney', timezone: 'Australia/Sydney', database: 'cert_syd' },
      PER: { name: 'Perth', timezone: 'Australia/Perth', database: 'cert_per' },
      ADL: { name: 'Adelaide', timezone: 'Australia/Adelaide', database: 'cert_adl' },
    });
    expect(TENANT_CODES).toEqual(['SYD', 'PER', 'ADL']);
  });

  it('uses codes the shared contract accepts', () => {
    for (const code of TENANT_CODES) expect(tenantCodeSchema.safeParse(code).success).toBe(true);
  });

  it('uses valid IANA zones and distinct databases', () => {
    for (const { timezone } of Object.values(TENANTS)) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: timezone })).not.toThrow();
    }
    const dbs = Object.values(TENANTS).map((t) => t.database);
    expect(new Set(dbs).size).toBe(dbs.length);
  });

  it('accepts every registry code', () => {
    for (const code of TENANT_CODES) expect(isTenantCode(code)).toBe(true);
  });

  it.each(['syd', ' SYD', 'XYZ', 'toString', undefined])('rejects %j (exact match only, spec §3.1)', (value) => {
    expect(isTenantCode(value)).toBe(false);
  });
});

describe('tenantDatabaseName', () => {
  it('is the registry database, with an optional prefix', () => {
    expect(tenantDatabaseName('PER')).toBe('cert_per');
    expect(tenantDatabaseName('ADL', 'cert_test_abc_1_')).toBe('cert_test_abc_1_cert_adl');
  });
});

describe('tenantDatabaseUrl', () => {
  it('appends the database and a small pool to the base', () => {
    expect(tenantDatabaseUrl('mysql://root:root@127.0.0.1:3307', 'cert_syd')).toBe(
      'mysql://root:root@127.0.0.1:3307/cert_syd?connection_limit=5',
    );
  });

  it('replaces a path on the base and keeps existing parameters', () => {
    expect(tenantDatabaseUrl('mysql://u:p@db:3306/other?sslaccept=strict', 'cert_per', 3)).toBe(
      'mysql://u:p@db:3306/cert_per?sslaccept=strict&connection_limit=3',
    );
  });

  it('keeps special characters in the password', () => {
    expect(tenantDatabaseUrl('mysql://u:p%40ss@db', 'cert_adl')).toBe(
      'mysql://u:p%40ss@db/cert_adl?connection_limit=5',
    );
  });
});
