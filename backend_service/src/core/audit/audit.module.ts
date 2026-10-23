import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Audit writer now; M2.T5 adds the read endpoint. */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
