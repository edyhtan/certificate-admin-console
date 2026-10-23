import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service.js';

/**
 * `GET /api/health`: needs no tenant header (D50).
 * 200 when every probe is up, 503 when any is down; the body is the report either way.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async get(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();
    res.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return report;
  }
}
