import type {
  CertificateDetail,
  CertificateListResponse,
  PaginationQuery,
} from '@cert/shared';
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app-error.js';
import { AppContext } from '../context/app-context.js';
import {
  DETAIL_SELECT,
  SUMMARY_SELECT,
  toDetail,
  toSummary,
} from './certificate.mapper.js';

@Injectable()
export class CertificatesService {
  constructor(private readonly ctx: AppContext) {}

  /**
   * One page of certificates, newest first, id as tie-breaker so pages are stable (spec §5.3).
   * M1: paging only; M2.T1 adds search, filters and sort.
   */
  async list(query: PaginationQuery): Promise<CertificateListResponse> {
    const { page, pageSize } = query;
    const db = this.ctx.db;
    // One transaction, so the rows and the total come from the same snapshot.
    const [rows, total] = await db.$transaction([
      db.certificate.findMany({
        select: SUMMARY_SELECT,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.certificate.count(),
    ]);
    return {
      items: rows.map(toSummary),
      page,
      pageSize,
      total,
      timezone: this.ctx.timeZone,
    };
  }

  /** One certificate. Unknown ids, including another tenant's, are 404 (D16). */
  async get(id: number): Promise<CertificateDetail> {
    const row = await this.ctx.db.certificate.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundError('Certificate not found');
    return toDetail(row, this.ctx.timeZone);
  }
}
