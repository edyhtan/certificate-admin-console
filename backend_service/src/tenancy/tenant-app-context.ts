import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AppContext, type Actor } from '../core/context/app-context.js';
import { TenantScopeStore, type TenantScope } from './tenant-scope.js';

/** Core code ran with no tenant: outside a request and outside `runInTenant`. A bug. */
export class NoTenantScopeError extends Error {
  constructor() {
    super('no tenant scope: core code ran outside a request or runInTenant()');
    this.name = 'NoTenantScopeError';
  }
}

/**
 * The tenancy module's binding for AppContext (D46): every getter reads the current tenant scope.
 * Fails closed: with no scope it throws, and there is no default tenant.
 */
@Injectable()
export class TenantAppContext extends AppContext {
  constructor(private readonly store: TenantScopeStore) {
    super();
  }

  private get scope(): TenantScope {
    const scope = this.store.current();
    if (!scope) throw new NoTenantScopeError();
    return scope;
  }

  get db(): PrismaClient {
    return this.scope.db;
  }

  get timeZone(): string {
    return this.scope.timeZone;
  }

  /** The tenant code is the serial prefix (spec §3.1); the core only knows it as a prefix. */
  get serialPrefix(): string {
    return this.scope.code;
  }

  get actor(): Actor {
    return this.scope.actor;
  }

  now(): Date {
    return new Date();
  }
}
