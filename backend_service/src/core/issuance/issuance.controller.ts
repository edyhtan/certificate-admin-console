import {
  issuancePreviewQuerySchema,
  issueCertificatesRequestSchema,
  type IssuancePreviewQuery,
  type IssuancePreviewResponse,
} from '@cert/shared';
import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { IssuanceService } from './issuance.service.js';
import { NdjsonWriter } from './ndjson-writer.js';

@Controller('issuances')
export class IssuanceController {
  constructor(private readonly issuance: IssuanceService) {}

  @Get('preview')
  preview(
    @Query(new ZodValidationPipe(issuancePreviewQuerySchema)) query: IssuancePreviewQuery,
  ): Promise<IssuancePreviewResponse> {
    return this.issuance.preview(query.courseId);
  }

  /**
   * Bulk issue (spec §5.2). Validation and the course check happen before the stream starts,
   * so they answer with the normal error shape. Then: 200 `application/x-ndjson`, one line per
   * event. The run finishes even if the client disconnects.
   */
  @Post()
  async issue(
    @Body(new ZodValidationPipe(issueCertificatesRequestSchema))
    body: z.output<typeof issueCertificatesRequestSchema>,
    @Res() res: Response,
  ): Promise<void> {
    const prepared = await this.issuance.prepare(body.courseId);
    const writer = new NdjsonWriter(res);
    writer.start();
    for await (const event of this.issuance.run(prepared)) {
      await writer.write(event);
    }
    writer.end();
  }
}
