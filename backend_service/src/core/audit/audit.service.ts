import type { AuditAction } from '@cert/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppContext } from '../context/app-context.js';

/** The certificate an event is about. Its names are copied onto the event (spec §3.2). */
export interface AuditedCertificate {
  id: number;
  serial: string;
  participantId: number;
  participantName: string;
  courseId: number;
  courseTitle: string;
}

export interface AuditEventInput {
  action: AuditAction;
  certificate: AuditedCertificate;
  /** e.g. `{ reason }` for a revoke. Omit when there is nothing to add. */
  details?: Record<string, string>;
}

@Injectable()
export class AuditService {
  constructor(private readonly ctx: AppContext) {}

  /**
   * Writes one audit event **inside the caller's transaction** (`tx`), so the event exists
   * only if the change it describes commits (D29). The actor and time come from AppContext.
   * Never pass the plain client: an event written outside the transaction could outlive a
   * rolled-back change.
   */
  async record(tx: Prisma.TransactionClient, event: AuditEventInput): Promise<void> {
    const { certificate } = event;
    const actor = this.ctx.actor;
    await tx.auditEvent.create({
      data: {
        action: event.action,
        occurredAt: this.ctx.now(),
        actorId: actor.id,
        actorName: actor.name,
        courseId: certificate.courseId,
        courseTitle: certificate.courseTitle,
        participantId: certificate.participantId,
        participantName: certificate.participantName,
        certificateId: certificate.id,
        serial: certificate.serial,
        ...(event.details && { details: event.details }),
      },
    });
  }
}
