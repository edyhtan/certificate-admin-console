import {
  CERTIFICATE_EXPORT_COLUMNS,
  type CertificateExportQuery,
} from '@cert/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppContext } from '../context/app-context.js';
import { localDate } from '../time/local-time.js';
import { buildCertificateQuery } from './certificate-query.js';
import { csvLine, UTF8_BOM } from './csv.js';

/** Rows per database read. Overridable so tests can force many small batches. */
export const EXPORT_BATCH_SIZE = Symbol('EXPORT_BATCH_SIZE');
export const DEFAULT_EXPORT_BATCH_SIZE = 1000;

const EXPORT_SELECT = {
  id: true,
  participantName: true,
  courseTitle: true,
  serial: true,
  issuedAt: true,
  status: true,
} as const;

@Injectable()
export class CertificateExportService {
  constructor(
    private readonly ctx: AppContext,
    @Inject(EXPORT_BATCH_SIZE) private readonly batchSize: number,
  ) {}

  /** `certificates-<tenant code>-<local date>.csv` (spec §5.5). */
  filename(): string {
    return `certificates-${this.ctx.serialPrefix}-${localDate(this.ctx.now(), this.ctx.timeZone)}.csv`;
  }

  /**
   * The whole file as chunks: BOM and header first, then one chunk per batch.
   * Batches use keyset pagination (Prisma `cursor` on `id` + `skip: 1`, same `orderBy` with the id
   * tie-breaker), so memory stays flat and no `OFFSET` slows down or skips rows as the table grows.
   * The `where` and `orderBy` come from the list's builder, so the file matches the screen.
   */
  async *chunks(query: CertificateExportQuery): AsyncGenerator<string> {
    const { where, orderBy } = buildCertificateQuery(query);
    const timeZone = this.ctx.timeZone;
    yield UTF8_BOM + csvLine(CERTIFICATE_EXPORT_COLUMNS);

    let cursor: number | undefined;
    for (;;) {
      const rows = await this.ctx.db.certificate.findMany({
        select: EXPORT_SELECT,
        where,
        orderBy,
        take: this.batchSize,
        ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
      });
      if (rows.length === 0) return;
      yield rows
        .map((r) =>
          csvLine([
            r.participantName,
            r.courseTitle,
            r.serial,
            localDate(r.issuedAt, timeZone),
            r.status,
          ]),
        )
        .join('');
      if (rows.length < this.batchSize) return;
      cursor = rows[rows.length - 1].id;
    }
  }
}
