import { TENANT_HEADER } from '@cert/shared';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/errors/app-error.js';
import { toErrorResponse } from '../common/errors/to-error-response.js';
import { TenantScopeStore } from './tenant-scope.js';
import { TenantScopes } from './tenant-scopes.js';
import { isTenantCode } from './tenants.js';

/**
 * Picks the tenant for every route except `GET /api/tenants` and `GET /api/health` (spec §5.1):
 * 1. `tenant_id` header, matched exactly against the registry; missing/unknown → 400 unknown_tenant.
 * 2. That tenant's client, timezone and `admin` actor.
 * 3. The rest of the request (guards, pipes, controller, core services, exception filter, streamed
 *    response) runs inside `store.run(scope, next)`.
 * Errors are written here in the contract shape, since they happen before Nest's filters run.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly scopes: TenantScopes,
    private readonly store: TenantScopeStore,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const code = req.headers[TENANT_HEADER];
    if (!isTenantCode(code)) {
      this.reply(
        res,
        new AppError(
          400,
          'unknown_tenant',
          code === undefined
            ? `Missing ${TENANT_HEADER} header`
            : `Unknown tenant; send ${TENANT_HEADER} with a tenant code from GET /api/tenants`,
        ),
      );
      return;
    }

    let scope;
    try {
      scope = await this.scopes.scopeFor(code);
    } catch (error) {
      this.logger.error(
        `${req.method} ${req.originalUrl}: could not open tenant ${code}`,
        error instanceof Error ? error.stack : String(error),
      );
      this.reply(res, error);
      return;
    }
    this.store.run(scope, () => next());
  }

  private reply(res: Response, error: unknown): void {
    const { status, body } = toErrorResponse(error);
    res.status(status).json(body);
  }
}
