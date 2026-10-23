import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { TenantMiddleware } from './tenant.middleware.js';
import { TenantScopeStore } from './tenant-scope.js';
import { TenantNotSetUpError, type TenantScopes } from './tenant-scopes.js';

function setup(scopeFor = vi.fn(async (code: string) => ({
  code,
  db: {} as PrismaClient,
  timeZone: 'Australia/Perth',
  actor: { id: 1, name: 'Administrator' },
}))) {
  const store = new TenantScopeStore();
  const middleware = new TenantMiddleware({ scopeFor } as unknown as TenantScopes, store);
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return { middleware, store, res, scopeFor };
}

const req = (headers: Record<string, string | string[]>) =>
  ({ headers, method: 'GET', originalUrl: '/api/courses' }) as unknown as Request;

describe('TenantMiddleware', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the rest of the request inside the tenant scope', async () => {
    const { middleware, store, res, scopeFor } = setup();
    let seen: string | undefined;
    const next = vi.fn(() => {
      seen = store.current()?.code;
    });
    await middleware.use(req({ tenant_id: 'PER' }), res as unknown as Response, next as NextFunction);
    expect(scopeFor).toHaveBeenCalledWith('PER');
    expect(next).toHaveBeenCalledOnce();
    expect(seen).toBe('PER');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 400 unknown_tenant when the header is missing', async () => {
    const { middleware, res } = setup();
    const next = vi.fn();
    await middleware.use(req({}), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'unknown_tenant', message: 'Missing tenant_id header' });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([['XYZ'], ['syd'], [' SYD'], ['toString'], [['SYD', 'PER']]])(
    'answers 400 unknown_tenant for %j (exact match only)',
    async (value) => {
      const { middleware, res, scopeFor } = setup();
      const next = vi.fn();
      await middleware.use(req({ tenant_id: value }), res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'unknown_tenant' });
      expect(next).not.toHaveBeenCalled();
      expect(scopeFor).not.toHaveBeenCalled();
    },
  );

  it('answers 500 without details when the tenant can’t be opened', async () => {
    const { middleware, res } = setup(vi.fn().mockRejectedValue(new TenantNotSetUpError('ADL')));
    const next = vi.fn();
    await middleware.use(req({ tenant_id: 'ADL' }), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal_error', message: 'Something went wrong' });
    expect(next).not.toHaveBeenCalled();
  });
});
