import { TENANT_HEADER } from '@cert/shared';
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/errors/app-error.js';
import { toErrorResponse } from '../common/errors/to-error-response.js';
import { TenantContext } from './tenant-context.js';
import { isTenantCode } from './tenants.js';

/**
 * Layer 1, mounting (spec §5.1): on every route except `GET /api/tenants` and `GET /api/health`,
 * `tenant_id` (exact match) → the rest of the request runs inside `context.run(code, next)`.
 * Errors are written here in the contract shape, since Nest's filters haven't run yet:
 * 400 unknown_tenant, or 500 when the tenant can't be opened.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly context: TenantContext) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const code = req.headers[TENANT_HEADER];
    if (!isTenantCode(code)) {
      const message =
        code === undefined
          ? `Missing ${TENANT_HEADER} header`
          : `Unknown tenant; send ${TENANT_HEADER} with a tenant code from GET /api/tenants`;
      this.reply(res, new AppError(400, 'unknown_tenant', message));
      return;
    }

    try {
      await this.context.run(code, () => next());
    } catch (error) {
      // Only opening the tenant can fail here: what `next()` starts reports its own errors.
      this.logger.error(
        `${req.method} ${req.originalUrl}: could not open tenant ${code}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (!res.headersSent) this.reply(res, error);
    }
  }

  private reply(res: Response, error: unknown): void {
    const { status, body } = toErrorResponse(error);
    res.status(status).json(body);
  }
}
