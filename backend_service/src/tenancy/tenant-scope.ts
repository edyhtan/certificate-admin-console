import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../core/context/app-context.js';
import type { TenantCode } from './tenants.js';

/** Everything that differs per tenant, for one request (or one `runInTenant` call). */
export interface TenantScope {
  readonly code: TenantCode;
  readonly db: PrismaClient;
  readonly timeZone: string;
  readonly actor: Readonly<Actor>;
}

/**
 * The ambient tenant (D46): one AsyncLocalStorage. The scope follows every `await`, promise,
 * timer and stream started inside `run`, so a streamed response keeps its tenant to the end.
 */
@Injectable()
export class TenantScopeStore {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  /** Runs `fn` with `scope` as the current tenant. The scope is frozen. */
  run<T>(scope: TenantScope, fn: () => T): T {
    return this.storage.run(Object.freeze({ ...scope, actor: Object.freeze({ ...scope.actor }) }), fn);
  }

  /** The current tenant, or undefined outside any request or `runInTenant`. */
  current(): TenantScope | undefined {
    return this.storage.getStore();
  }
}
