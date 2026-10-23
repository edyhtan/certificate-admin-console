import {
  certificateExportQuerySchema,
  certificateListQuerySchema,
  CSV_CONTENT_TYPE,
  idParamSchema,
  revokeCertificateRequestSchema,
  type CertificateDetail,
  type CertificateExportQuery,
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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { StreamWriter } from '../http/stream-writer.js';
import { CertificateExportService } from './certificate-export.service.js';
import { CertificatesService } from './certificates.service.js';

/**
 * Routes with fixed paths (M2.T4's `export.csv`) must be declared above `:id`,
 * or `:id` would catch them.
 */
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly exporter: CertificateExportService,
  ) {}

  /** Search, filters, sort and paging (spec §5.3). */
  @Get()
  list(
    @Query(new ZodValidationPipe(certificateListQuerySchema))
    query: CertificateListQuery,
  ): Promise<CertificateListResponse> {
    return this.certificates.list(query);
  }

  /**
   * CSV of every certificate matching the list's search, filters and sort (spec §5.5). Bad input
   * answers with the normal error shape; then the file streams batch by batch. Stops reading if
   * the client goes away. Declared before `:id` so `:id` doesn't catch it.
   */
  @Get('export.csv')
  async export(
    @Query(new ZodValidationPipe(certificateExportQuerySchema)) query: CertificateExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const writer = new StreamWriter(res);
    writer.start({
      'Content-Type': CSV_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${this.exporter.filename()}"`,
    });
    for await (const chunk of this.exporter.chunks(query)) {
      if (!writer.connected) break;
      await writer.write(chunk);
    }
    writer.end();
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
