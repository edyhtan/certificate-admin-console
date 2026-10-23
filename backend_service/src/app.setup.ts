import type { INestApplication } from '@nestjs/common';

/** App-wide settings shared by `main.ts` and the e2e tests, so tests run the real setup. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
