import type { INestApplication, Provider, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

export interface TestAppOptions {
  /** Extra test-only controllers, e.g. a route that throws. */
  controllers?: Type[];
  providers?: Provider[];
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
  if (options.configure) builder = options.configure(builder);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}
