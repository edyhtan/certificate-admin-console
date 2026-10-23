import { AppConfig, loadAppConfig } from './app-config.js';

const valid = { DATABASE_URL_BASE: 'mysql://root:root@127.0.0.1:3307' };

describe('loadAppConfig', () => {
  it('reads a complete environment', () => {
    const config = loadAppConfig({ ...valid, API_PORT: '4000', TENANT_DATABASE_PREFIX: 'cert_test_x_1_' });
    expect(config).toBeInstanceOf(AppConfig);
    expect(config).toEqual(
      new AppConfig({
        apiPort: 4000,
        databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
        tenantDatabasePrefix: 'cert_test_x_1_',
      }),
    );
  });

  it('defaults the port to 3000 and the tenant database prefix to empty', () => {
    const config = loadAppConfig(valid);
    expect(config.apiPort).toBe(3000);
    expect(config.tenantDatabasePrefix).toBe('');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(loadAppConfig(valid))).toBe(true);
  });

  it('ignores the old single-tenant variables', () => {
    const config = loadAppConfig({ ...valid, APP_TIMEZONE: 'Mars/Base', APP_SERIAL_PREFIX: 'x', DATABASE_URL: 'y' });
    expect(config.databaseUrlBase).toBe(valid.DATABASE_URL_BASE);
  });

  it('requires DATABASE_URL_BASE as a mysql:// URL', () => {
    expect(() => loadAppConfig({})).toThrow(/DATABASE_URL_BASE is required/);
    expect(() => loadAppConfig({ DATABASE_URL_BASE: 'postgres://x' })).toThrow(
      /DATABASE_URL_BASE must be a mysql:\/\/ URL/,
    );
  });

  it.each(['x;drop', 'A', 'a-b', 'a`b'])('rejects tenant database prefix %j', (bad) => {
    expect(() => loadAppConfig({ ...valid, TENANT_DATABASE_PREFIX: bad })).toThrow(
      /TENANT_DATABASE_PREFIX may only contain/,
    );
  });

  it.each(['0', '70000', 'abc'])('rejects port %j', (port) => {
    expect(() => loadAppConfig({ ...valid, API_PORT: port })).toThrow(/API_PORT/);
  });
});
