import { Injectable } from '@nestjs/common';
import type { Actor } from '../core/context/app-context.js';
import { TenantClients } from './tenant-clients.js';
import { TenantScopeStore, type TenantScope } from './tenant-scope.js';
import { TENANTS, type TenantCode } from './tenants.js';

export const ADMIN_USERNAME = 'admin';

/** The tenant database has no `admin` row: it hasn't been set up. */
export class TenantNotSetUpError extends Error {
  constructor(readonly code: TenantCode) {
    super(`tenant ${code} has no "${ADMIN_USERNAME}" row; run npm run db:setup`);
    this.name = 'TenantNotSetUpError';
  }
}

/** Builds tenant scopes and runs code inside them. */
@Injectable()
export class TenantScopes {
  /** The admin row never changes once set up, so it is read once per tenant. */
  private readonly actors = new Map<TenantCode, Actor>();

  constructor(
    private readonly clients: TenantClients,
    private readonly store: TenantScopeStore,
  ) {}

  /** The scope for a registry tenant: its client, timezone and `admin` actor. */
  async scopeFor(code: TenantCode): Promise<TenantScope> {
    const db = this.clients.get(code);
    let actor = this.actors.get(code);
    if (!actor) {
      const row = await db.admin.findUnique({
        where: { username: ADMIN_USERNAME },
        select: { id: true, name: true },
      });
      if (!row) throw new TenantNotSetUpError(code);
      actor = row;
      this.actors.set(code, actor);
    }
    return { code, db, timeZone: TENANTS[code].timezone, actor };
  }

  /**
   * Runs `fn` as tenant `code`, for work that doesn't come from a request (scripts, tests).
   * Core services called inside see that tenant through AppContext.
   */
  async runInTenant<T>(code: TenantCode, fn: () => Promise<T> | T): Promise<T> {
    const scope = await this.scopeFor(code);
    return this.store.run(scope, fn);
  }
}
