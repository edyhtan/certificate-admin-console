import { AppConfig, loadAppConfig } from './app-config.js';

const valid = {
  DATABASE_URL: 'mysql://root:root@127.0.0.1:3307/cert_syd',
  APP_TIMEZONE: 'Australia/Sydney',
  APP_SERIAL_PREFIX: 'SYD',
};

describe('loadAppConfig', () => {
  it('reads a complete environment', () => {
    const config = loadAppConfig({
      ...valid,
      API_PORT: '4000',
      DATABASE_URL_BASE: 'mysql://root:root@127.0.0.1:3307',
    });
    expect(config).toBeInstanceOf(AppConfig);
    expect(config).toMatchObject({
      apiPort: 4000,
      databaseUrl: valid.DATABASE_URL,
      databaseUrlBase: 'mysql://root:root@127.0.0.1:3307',
      timeZone: 'Australia/Sydney',
      serialPrefix: 'SYD',
    });
  });

  it('defaults the port to 3000 and leaves the base URL unset', () => {
    const config = loadAppConfig(valid);
    expect(config.apiPort).toBe(3000);
    expect(config.databaseUrlBase).toBeUndefined();
  });

  it('is frozen', () => {
    const config = loadAppConfig(valid);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('lists every missing variable in one error', () => {
    expect(() => loadAppConfig({})).toThrow(
      /DATABASE_URL is required[\s\S]*APP_TIMEZONE is required[\s\S]*APP_SERIAL_PREFIX is required/,
    );
  });

  it('rejects a database URL that is not MySQL', () => {
    expect(() =>
      loadAppConfig({ ...valid, DATABASE_URL: 'postgres://x/y' }),
    ).toThrow(/DATABASE_URL must be a mysql:\/\/ URL/);
  });

  it.each(['Mars/Olympus', '+10:00', '-08:00', ''])(
    'rejects time zone %j',
    (tz) => {
      expect(() => loadAppConfig({ ...valid, APP_TIMEZONE: tz })).toThrow(
        /APP_TIMEZONE must be an IANA time zone/,
      );
    },
  );

  it.each(['Australia/Perth', 'Australia/Adelaide', 'UTC'])(
    'accepts time zone %s',
    (tz) => {
      expect(loadAppConfig({ ...valid, APP_TIMEZONE: tz }).timeZone).toBe(tz);
    },
  );

  it.each(['syd', 'SY', 'SYDN', 'S1D'])('rejects serial prefix %j', (p) => {
    expect(() => loadAppConfig({ ...valid, APP_SERIAL_PREFIX: p })).toThrow(
      /APP_SERIAL_PREFIX must be 3 upper-case letters/,
    );
  });

  it.each(['0', '70000', 'abc'])('rejects port %j', (port) => {
    expect(() => loadAppConfig({ ...valid, API_PORT: port })).toThrow(
      /API_PORT/,
    );
  });
});
