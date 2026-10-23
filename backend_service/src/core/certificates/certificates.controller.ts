import {
  idParamSchema,
  paginationQuerySchema,
  type CertificateDetail,
  type CertificateListResponse,
  type IdParam,
  type PaginationQuery,
} from '@cert/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { CertificatesService } from './certificates.service.js';

/**
 * Routes with fixed paths (M2.T4's `export.csv`) must be declared above `:id`,
 * or `:id` would catch them.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** M1: paging only. M2.T1 switches to `certificateListQuerySchema` (search, filters, sort). */
  @Get()
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<CertificateListResponse> {
    return this.certificates.list(query);
  }

  @Get(':id')
  get(
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParam,
  ): Promise<CertificateDetail> {
    return this.certificates.get(params.id);
  }
}
