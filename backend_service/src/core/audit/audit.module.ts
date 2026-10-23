import { Module } from '@nestjs/common';
import { AuditEventsController } from './audit-events.controller.js';
import { AuditEventsService } from './audit-events.service.js';
import { AuditService } from './audit.service.js';

/** The audit writer (used inside other modules' transactions) and the read endpoint. */
@Module({
  controllers: [AuditEventsController],
  providers: [AuditService, AuditEventsService],
  exports: [AuditService],
})
export class AuditModule {}
