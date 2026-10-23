import { HealthProbe } from '../health/health-probe.js';
import type { TenantScopes } from './tenant-scopes.js';
import type { TenantCode } from './tenants.js';

/**
 * Up when the tenant's `admin` row can be loaded as the actor, loading it if it isn't cached yet.
 * Writes need that actor, so health answers 503 for as long as the tenant can't take writes, and
 * recovers without a restart once the row exists (D61, carried into M3).
 */
export class TenantAdminProbe extends HealthProbe {
  readonly name: string;

  constructor(
    private readonly scopes: TenantScopes,
    private readonly code: TenantCode,
  ) {
    super();
    this.name = `admin:${code}`;
  }

  async check(): Promise<void> {
    await this.scopes.scopeFor(this.code);
  }
}
