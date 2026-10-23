import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [ConfigModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
