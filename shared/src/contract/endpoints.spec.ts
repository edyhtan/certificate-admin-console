import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPath, endpoints, type EndpointDefinition } from './endpoints.js';
import {
  apiErrorBodySchema,
  ERROR_CODES,
  ERROR_STATUS,
} from './errors.js';
import { tenantCodeSchema, tenantListResponseSchema } from './tenants.js';

const all = Object.entries(endpoints) as [string, EndpointDefinition][];

describe('endpoints', () => {
  it('needs the tenant header everywhere except health and tenants (spec §5.1, D50)', () => {
    const withoutHeader = all
      .filter(([, e]) => !e.tenantHeader)
      .map(([, e]) => e.path)
      .sort();
    expect(withoutHeader).toEqual(['/api/health', '/api/tenants']);
  });

  it('gives every tenant-scoped endpoint the unknown_tenant error', () => {
    for (const [name, e] of all) {
      if (e.tenantHeader) expect(e.errors, name).toContain('unknown_tenant');
    }
  });

  it('has one definition per method and path', () => {
    const keys = all.map(([, e]) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('describes a JSON response for every JSON endpoint', () => {
    for (const [name, e] of all) {
      expect(e.responseType === 'json' ? e.response : 'n/a', name).toBeDefined();
    }
  });

  it('only lists error codes that exist', () => {
    for (const [, e] of all) {
      for (const code of e.errors) expect(ERROR_CODES).toContain(code);
    }
  });

  it('is fully documented in docs/api.md', () => {
    const doc = readFileSync(
      fileURLToPath(new URL('../../../docs/api.md', import.meta.url)),
      'utf8',
    );
    for (const [, e] of all) {
      expect(doc, `${e.method} ${e.path}`).toContain(`\`${e.method} ${e.path}\``);
    }
    for (const code of ERROR_CODES) {
      expect(doc, code).toContain(`\`${code}\``);
    }
  });
});

describe('buildPath', () => {
  it('fills and encodes path parameters', () => {
    expect(buildPath(endpoints.getCertificate.path, { id: 7 })).toBe(
      '/api/certificates/7',
    );
    expect(buildPath('/api/x/:id', { id: 'a/b' })).toBe('/api/x/a%2Fb');
  });

  it('throws when a parameter is missing', () => {
    expect(() => buildPath(endpoints.revokeCertificate.path)).toThrow(
      'missing path parameter id',
    );
  });

  it('leaves paths without parameters alone', () => {
    expect(buildPath(endpoints.listCourses.path)).toBe('/api/courses');
  });
});

describe('errors', () => {
  it('maps every code to its status', () => {
    expect(ERROR_STATUS).toMatchObject({
      validation_failed: 400,
      unknown_tenant: 400,
      not_found: 404,
      duplicate: 409,
      internal_error: 500,
    });
  });

  it('accepts the error shape with and without fields', () => {
    expect(
      apiErrorBodySchema.safeParse({
        error: 'duplicate',
        message: 'This value is already in use',
        fields: { email: 'is already in use' },
      }).success,
    ).toBe(true);
    expect(
      apiErrorBodySchema.safeParse({ error: 'not_found', message: 'Not found' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(
      apiErrorBodySchema.safeParse({ error: 'teapot', message: 'x' }).success,
    ).toBe(false);
  });
});

describe('tenants', () => {
  it.each(['SYD', 'PER', 'ADL'])('accepts tenant code %s', (code) => {
    expect(tenantCodeSchema.parse(code)).toBe(code);
  });

  it.each(['syd', 'SY', 'SYDN', ''])('rejects tenant code %j', (code) => {
    expect(tenantCodeSchema.safeParse(code).success).toBe(false);
  });

  it('never carries database names (D27): unknown keys are stripped', () => {
    expect(
      tenantListResponseSchema.parse({
        items: [
          {
            code: 'SYD',
            name: 'Sydney',
            timezone: 'Australia/Sydney',
            database: 'cert_syd',
          },
        ],
      }),
    ).toEqual({
      items: [{ code: 'SYD', name: 'Sydney', timezone: 'Australia/Sydney' }],
    });
  });
});
