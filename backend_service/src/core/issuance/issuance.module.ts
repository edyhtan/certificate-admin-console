import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { SerialsModule } from '../serials/serials.module.js';
import { IssuanceController } from './issuance.controller.js';
import { IssuanceService } from './issuance.service.js';

@Module({
  imports: [AuditModule, SerialsModule],
  controllers: [IssuanceController],
  providers: [IssuanceService],
})
export class IssuanceModule {}
