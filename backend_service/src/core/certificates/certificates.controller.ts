import {
  certificateListQuerySchema,
  idParamSchema,
  revokeCertificateRequestSchema,
  type CertificateDetail,
  type CertificateListQuery,
  type CertificateListResponse,
  type IdParam,
  type RevokeCertificate,
} from '@cert/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { CertificatesService } from './certificates.service.js';

/**
 * Routes with fixed paths (M2.T4's `export.csv`) must be declared above `:id`,
 * or `:id` would catch them.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Search, filters, sort and paging (spec §5.3). */
  @Get()
  list(
    @Query(new ZodValidationPipe(certificateListQuerySchema))
    query: CertificateListQuery,
  ): Promise<CertificateListResponse> {
    return this.certificates.list(query);
  }

  @Get(':id')
  get(
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParam,
  ): Promise<CertificateDetail> {
    return this.certificates.get(params.id);
  }

  /** 200 both when it revokes and when the certificate was already revoked (spec §5.4). */
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParam,
    @Body(new ZodValidationPipe(revokeCertificateRequestSchema))
    body: RevokeCertificate,
  ): Promise<CertificateDetail> {
    return this.certificates.revoke(params.id, body);
  }
}
