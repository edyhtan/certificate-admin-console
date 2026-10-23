import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  HEALTH_PROBE_TIMEOUT_MS,
  HEALTH_PROBES,
  type HealthProbe,
} from './health-probe.js';

export interface HealthCheckResult {
  status: 'up' | 'down';
  durationMs: number;
}

export interface HealthReport {
  status: 'ok' | 'error';
  checks: Record<string, HealthCheckResult>;
}

const DEFAULT_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly probes: readonly HealthProbe[];
  private readonly timeoutMs: number;

  constructor(
    @Optional() @Inject(HEALTH_PROBES) probes?: HealthProbe[],
    @Optional() @Inject(HEALTH_PROBE_TIMEOUT_MS) timeoutMs?: number,
  ) {
    this.probes = probes ?? [];
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Runs every probe in parallel. The report is `ok` only if all of them are up. */
  async check(): Promise<HealthReport> {
    const results = await Promise.all(
      this.probes.map(
        async (probe) => [probe.name, await this.run(probe)] as const,
      ),
    );
    const checks = Object.fromEntries(results);
    const allUp = results.every(([, r]) => r.status === 'up');
    return { status: allUp ? 'ok' : 'error', checks };
  }

  private async run(probe: HealthProbe): Promise<HealthCheckResult> {
    const started = performance.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer within ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });
    try {
      await Promise.race([probe.check(), timeout]);
      return { status: 'up', durationMs: elapsed(started) };
    } catch (error) {
      // Details go to the log only; the endpoint needs no auth, so it reports up/down.
      this.logger.warn(
        `health probe "${probe.name}" is down: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'down', durationMs: elapsed(started) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
