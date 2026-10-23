import { HealthProbe } from '../health/health-probe.js';
import {
  ADMIN_USERNAME,
  type SingleTenantAppContext,
} from './single-tenant-app-context.js';

/**
 * Up when the `admin` row is loaded, loading it first if needed. Writes need it as the actor,
 * so the health check answers 503 for as long as writes can't work (D60).
 */
export class AdminHealthProbe extends HealthProbe {
  readonly name = 'admin';

  constructor(private readonly ctx: SingleTenantAppContext) {
    super();
  }

  async check(): Promise<void> {
    if (!(await this.ctx.ensureActor())) {
      throw new Error(`no "${ADMIN_USERNAME}" row loaded`);
    }
  }
}
