import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { CoursesModule } from './core/courses/courses.module.js';
import { ParticipantsModule } from './core/participants/participants.module.js';
import { HealthModule } from './health/health.module.js';
import { SingleTenantModule } from './single-tenant/single-tenant.module.js';

@Module({
  imports: [
    ConfigModule,
    SingleTenantModule,
    HealthModule,
    CoursesModule,
    ParticipantsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
