import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HealthController } from './health.controller.js';
import type { HealthReport, HealthService } from './health.service.js';

function controllerReturning(report: HealthReport) {
  const service = { check: vi.fn().mockResolvedValue(report) };
  return new HealthController(service as unknown as HealthService);
}

function fakeResponse() {
  return { status: vi.fn() } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
  };
}

describe('HealthController', () => {
  it('answers 200 with the report when everything is up', async () => {
    const report: HealthReport = {
      status: 'ok',
      checks: { database: { status: 'up', durationMs: 3 } },
    };
    const res = fakeResponse();
    await expect(controllerReturning(report).get(res)).resolves.toBe(report);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('answers 503 with the report when a check is down', async () => {
    const report: HealthReport = {
      status: 'error',
      checks: { database: { status: 'down', durationMs: 2000 } },
    };
    const res = fakeResponse();
    await expect(controllerReturning(report).get(res)).resolves.toBe(report);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
