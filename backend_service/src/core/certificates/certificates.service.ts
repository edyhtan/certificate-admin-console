import type {
  CertificateDetail,
  CertificateListResponse,
  PaginationQuery,
  RevokeCertificate,
} from '@cert/shared';
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { AppContext } from '../context/app-context.js';
import {
  DETAIL_SELECT,
  SUMMARY_SELECT,
  toDetail,
  toSummary,
} from './certificate.mapper.js';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly ctx: AppContext,
    private readonly audit: AuditService,
  ) {}

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

  /**
   * `valid` → `revoked` plus one `certificate.revoked` audit event, in one transaction
   * (spec §5.4). Revoking a revoked certificate returns it as it is and writes nothing.
   *
   * The update only matches a `valid` row, and MySQL locks that row until commit, so of two
   * revokes at the same time exactly one changes it and writes the event; the other sees
   * nothing to update and answers with the current state.
   */
  async revoke(id: number, input: RevokeCertificate): Promise<CertificateDetail> {
    const actor = this.ctx.actor;
    const now = this.ctx.now();
    const reason = input.reason ?? null;

    const row = await this.ctx.db.$transaction(async (tx) => {
      const { count } = await tx.certificate.updateMany({
        where: { id, status: 'valid' },
        data: {
          status: 'revoked',
          revokedAt: now,
          revokedById: actor.id,
          revokeReason: reason,
        },
      });

      const current = await tx.certificate.findUnique({
        where: { id },
        select: DETAIL_SELECT,
      });
      if (!current) throw new NotFoundError('Certificate not found');

      if (count === 1) {
        await this.audit.record(tx, {
          action: 'certificate.revoked',
          certificate: current,
          ...(reason !== null && { details: { reason } }),
        });
      }
      return current;
    });

    return toDetail(row, this.ctx.timeZone);
  }
}
