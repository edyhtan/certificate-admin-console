import {
  auditEventListQuerySchema,
  type AuditEventListQuery,
  type AuditEventListResponse,
} from '@cert/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { AuditEventsService } from './audit-events.service.js';

@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly events: AuditEventsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(auditEventListQuerySchema)) query: AuditEventListQuery,
  ): Promise<AuditEventListResponse> {
    return this.events.list(query);
  }
}
