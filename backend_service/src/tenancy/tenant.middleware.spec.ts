import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { TenantContext } from './tenant-context.js';
import { TenantNotSetUpError } from './tenant-databases.js';
import { TenantMiddleware } from './tenant.middleware.js';

/** A stand-in for TenantContext.run: records the tenant, then runs fn. */
function setup(run = vi.fn(async (_code: string, fn: () => unknown) => fn())) {
  const middleware = new TenantMiddleware({ run } as unknown as TenantContext);
  const res = { status: vi.fn(), json: vi.fn(), headersSent: false };
  res.status.mockReturnValue(res);
  return { middleware, res, run };
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

  it('runs the rest of the request as the header’s tenant', async () => {
    const { middleware, res, run } = setup();
    const next = vi.fn();
    await middleware.use(req({ tenant_id: 'PER' }), res as unknown as Response, next as NextFunction);
    expect(run).toHaveBeenCalledWith('PER', expect.any(Function));
    expect(next).toHaveBeenCalledOnce();
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

  it.each([['XYZ'], ['syd'], [['SYD', 'PER']]])('answers 400 unknown_tenant for %j (exact match only)', async (value) => {
    const { middleware, res, run } = setup();
    const next = vi.fn();
    await middleware.use(req({ tenant_id: value }), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'unknown_tenant' });
    expect(next).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('answers 500 without details when the tenant can’t be opened', async () => {
    const { middleware, res } = setup(vi.fn().mockRejectedValue(new TenantNotSetUpError('ADL')));
    const next = vi.fn();
    await middleware.use(req({ tenant_id: 'ADL' }), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal_error', message: 'Something went wrong' });
    expect(next).not.toHaveBeenCalled();
  });
});
