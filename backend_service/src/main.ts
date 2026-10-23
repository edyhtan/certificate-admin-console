import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';
import { loadEnvFile } from './config/load-env-file.js';

async function bootstrap() {
  loadEnvFile();
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(app.get(AppConfig).apiPort);
}
await bootstrap();
