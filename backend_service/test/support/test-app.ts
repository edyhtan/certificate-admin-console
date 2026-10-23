import { TENANT_HEADER } from '@cert/shared';
import type { INestApplication, Provider, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AppContext } from '../../src/core/context/app-context.js';
import type { TenantCode } from '../../src/tenancy/tenants.js';

export interface TestAppOptions {
  /** Extra test-only controllers, e.g. a route that throws. */
  controllers?: Type[];
  providers?: Provider[];
  /** Binds AppContext to this instead of the single-tenant binding (see `testAppContext`). */
  context?: AppContext;
  /** Last chance to override providers before compiling. */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * The real AppModule with the real app setup, against this run's throwaway database
 * (config comes from the env set in `setup-env.ts`).
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  });
  if (options.context) {
    builder = builder.overrideProvider(AppContext).useValue(options.context);
  }
  if (options.configure) builder = options.configure(builder);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

/**
 * A supertest agent that sends `tenant_id: <code>` on every request (Sydney by default).
 * Use `request(app.getHttpServer())` instead to test requests without the header.
 */
export function api(app: INestApplication, code: TenantCode = 'SYD') {
  return request.agent(app.getHttpServer()).set(TENANT_HEADER, code);
}
