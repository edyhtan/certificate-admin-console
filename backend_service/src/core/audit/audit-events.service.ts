import type {
  AuditAction,
  AuditEvent,
  AuditEventListQuery,
  AuditEventListResponse,
} from '@cert/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppContext } from '../context/app-context.js';

const EVENT_SELECT = {
  id: true,
  occurredAt: true,
  action: true,
  actorId: true,
  actorName: true,
  courseId: true,
  courseTitle: true,
  participantId: true,
  participantName: true,
  certificateId: true,
  serial: true,
  details: true,
} as const satisfies Prisma.AuditEventSelect;

type EventRow = Prisma.AuditEventGetPayload<{ select: typeof EVENT_SELECT }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Who and what are already copied onto the row, so no joins are needed (spec §5.7). */
export function toAuditEvent(row: EventRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    action: row.action as AuditAction,
    actor: { id: row.actorId, name: row.actorName },
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    participantId: row.participantId,
    participantName: row.participantName,
    certificateId: row.certificateId,
    serial: row.serial,
    details: isRecord(row.details) ? row.details : null,
  };
}

@Injectable()
export class AuditEventsService {
  constructor(private readonly ctx: AppContext) {}

  /** Read-only, newest first (id breaks ties), filtered and paginated like the list (spec §5.7). */
  async list(query: AuditEventListQuery): Promise<AuditEventListResponse> {
    const { page, pageSize } = query;
    const where: Prisma.AuditEventWhereInput = {};
    if (query.certificateId !== undefined) where.certificateId = query.certificateId;
    if (query.courseId !== undefined) where.courseId = query.courseId;
    if (query.action !== undefined) where.action = query.action;

    const db = this.ctx.db;
    const [rows, total] = await db.$transaction([
      db.auditEvent.findMany({
        select: EVENT_SELECT,
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditEvent.count({ where }),
    ]);
    return {
      items: rows.map(toAuditEvent),
      page,
      pageSize,
      total,
      timezone: this.ctx.timeZone,
    };
  }
}
