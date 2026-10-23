import { Logger } from '@nestjs/common';
import type { HealthProbe } from './health-probe.js';
import { HealthService } from './health.service.js';

function probe(name: string, check: () => Promise<void>): HealthProbe {
  return { name, check };
}

const up = (name: string) => probe(name, () => Promise.resolve());
const down = (name: string) =>
  probe(name, () => Promise.reject(new Error('connection refused')));
const hangs = (name: string) => probe(name, () => new Promise<void>(() => {}));

describe('HealthService', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is ok with no probes registered', async () => {
    await expect(new HealthService().check()).resolves.toEqual({
      status: 'ok',
      checks: {},
    });
  });

  it('is ok when every probe is up', async () => {
    const report = await new HealthService([up('database'), up('cache')]).check();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({
      database: { status: 'up', durationMs: expect.any(Number) },
      cache: { status: 'up', durationMs: expect.any(Number) },
    });
  });

  it('is an error when one probe fails, and logs why', async () => {
    const report = await new HealthService([up('cache'), down('database')]).check();
    expect(report.status).toBe('error');
    expect(report.checks.database.status).toBe('down');
    expect(report.checks.cache.status).toBe('up');
    expect(warn).toHaveBeenCalledWith(
      'health probe "database" is down: connection refused',
    );
  });

  it('counts a probe that never answers as down after the timeout', async () => {
    vi.useFakeTimers();
    const pending = new HealthService([hangs('database')], 50).check();
    await vi.advanceTimersByTimeAsync(50);
    const report = await pending;
    expect(report.status).toBe('error');
    expect(report.checks.database.status).toBe('down');
    expect(warn).toHaveBeenCalledWith(
      'health probe "database" is down: no answer within 50 ms',
    );
  });

  it('runs probes in parallel, so one slow probe sets the total time', async () => {
    vi.useFakeTimers();
    const slow = (name: string) =>
      probe(name, () => new Promise<void>((r) => setTimeout(r, 40)));
    const pending = new HealthService([slow('a'), slow('b')], 100).check();
    await vi.advanceTimersByTimeAsync(40);
    const report = await pending;
    expect(report.status).toBe('ok');
  });
});
