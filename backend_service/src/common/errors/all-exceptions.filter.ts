import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { toErrorResponse } from './to-error-response.js';

/** Global filter: every error leaves the API in the contract shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, body } = toErrorResponse(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // A streamed response (NDJSON, CSV) may already have started; it can only be ended.
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  }
}
