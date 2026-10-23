/**
 * One dependency the health check pings, such as a database.
 * `check()` resolves when the dependency answers and rejects when it doesn't.
 */
export abstract class HealthProbe {
  abstract readonly name: string;
  abstract check(): Promise<void>;
}

/**
 * Token for the list of probes. The module that owns a dependency provides it
 * (the single-tenant database module from M1.T5, the tenancy module from M3).
 */
export const HEALTH_PROBES = Symbol('HEALTH_PROBES');

/** Token for how long one probe may take before it counts as down. */
export const HEALTH_PROBE_TIMEOUT_MS = Symbol('HEALTH_PROBE_TIMEOUT_MS');
