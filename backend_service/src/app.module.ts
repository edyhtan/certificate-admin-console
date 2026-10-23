import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { CertificatesModule } from './core/certificates/certificates.module.js';
import { CoursesModule } from './core/courses/courses.module.js';
import { IssuanceModule } from './core/issuance/issuance.module.js';
import { ParticipantsModule } from './core/participants/participants.module.js';
import { HealthModule } from './health/health.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

@Module({
  imports: [
    ConfigModule,
    TenancyModule,
    HealthModule,
    CoursesModule,
    ParticipantsModule,
    CertificatesModule,
    IssuanceModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
