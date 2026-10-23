import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import {
  CertificateExportService,
  DEFAULT_EXPORT_BATCH_SIZE,
  EXPORT_BATCH_SIZE,
} from './certificate-export.service.js';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesService } from './certificates.service.js';

@Module({
  imports: [AuditModule],
  controllers: [CertificatesController],
  providers: [
    CertificatesService,
    CertificateExportService,
    { provide: EXPORT_BATCH_SIZE, useValue: DEFAULT_EXPORT_BATCH_SIZE },
  ],
})
export class CertificatesModule {}
