import type {
  IssuanceEvent,
  IssuancePreviewResponse,
  IssuanceResultEvent,
} from '@cert/shared';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { AppContext } from '../context/app-context.js';
import { SerialService } from '../serials/serial.js';

/** A completed enrollment the run will try, with what's needed to issue it. */
export interface Candidate {
  enrollmentId: number;
  participantId: number;
  participantName: string;
}

/** A run that has passed its checks and is ready to stream. */
export interface PreparedRun {
  course: { id: number; title: string };
  candidates: Candidate[];
}

/** Retries for MySQL deadlocks / write conflicts (Prisma P2034) before reporting `failed`. */
const MAX_ATTEMPTS = 3;

function prismaCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'PrismaClientKnownRequestError'
  ) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function prismaTarget(error: unknown): unknown {
  return (error as { meta?: { target?: unknown } }).meta?.target;
}

/** The enrollment's certificate already exists: a parallel run got there first. */
function isEnrollmentClash(error: unknown): boolean {
  if (prismaCode(error) !== 'P2002') return false;
  const target = prismaTarget(error);
  const names = Array.isArray(target) ? target : [target];
  return names.some(
    (t) => typeof t === 'string' && (t.includes('enrollment') || t === 'certificate_enrollment_key'),
  );
}

/** A message safe to show the admin; details go to the log. */
function failureMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const code = prismaCode(error);
  if (code) return `Database error (${code})`;
  return 'Unexpected error';
}

@Injectable()
export class IssuanceService {
  private readonly logger = new Logger(IssuanceService.name);

  constructor(
    private readonly ctx: AppContext,
    private readonly serials: SerialService,
    private readonly audit: AuditService,
  ) {}

  private async courseOrThrow(courseId: number) {
    const course = await this.ctx.db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw new NotFoundError('Course not found');
    return course;
  }

  /** How many learners a run would issue to now (D41). */
  async preview(courseId: number): Promise<IssuancePreviewResponse> {
    await this.courseOrThrow(courseId);
    const completed = { courseId, status: 'completed' } as const;
    const [completedCount, alreadyIssued] = await this.ctx.db.$transaction([
      this.ctx.db.enrollment.count({ where: completed }),
      this.ctx.db.enrollment.count({ where: { ...completed, certificate: { isNot: null } } }),
    ]);
    return {
      courseId,
      completed: completedCount,
      alreadyIssued,
      eligible: completedCount - alreadyIssued,
    };
  }

  /**
   * Checks the course and loads the candidates: every completed enrollment, in id order.
   * Throws before any streaming starts, so errors here use the normal error shape.
   */
  async prepare(courseId: number): Promise<PreparedRun> {
    const course = await this.courseOrThrow(courseId);
    const rows = await this.ctx.db.enrollment.findMany({
      where: { courseId, status: 'completed' },
      select: {
        id: true,
        participant: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { id: 'asc' },
    });
    return {
      course,
      candidates: rows.map((r) => ({
        enrollmentId: r.id,
        participantId: r.participant.id,
        participantName: `${r.participant.firstName} ${r.participant.lastName}`,
      })),
    };
  }

  /**
   * Issues to each candidate in its own transaction and yields the progress events
   * (`start`, one `result` per candidate, `done`). Repeat-safe: an enrollment with a certificate
   * is skipped, and the unique `enrollment_id` stops two runs issuing the same one (D28).
   */
  async *run(prepared: PreparedRun): AsyncGenerator<IssuanceEvent> {
    const counts = { issued: 0, skipped: 0, failed: 0 };
    yield { type: 'start', total: prepared.candidates.length };
    for (const candidate of prepared.candidates) {
      const result = await this.issueOne(prepared.course, candidate);
      counts[result.outcome]++;
      yield result;
    }
    yield { type: 'done', ...counts };
  }

  private async issueOne(
    course: PreparedRun['course'],
    candidate: Candidate,
  ): Promise<IssuanceResultEvent> {
    const base = {
      type: 'result' as const,
      enrollmentId: candidate.enrollmentId,
      participantName: candidate.participantName,
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const outcome = await this.ctx.db.$transaction((tx) =>
          this.issueInTransaction(tx, course, candidate),
        );
        return outcome.issued
          ? { ...base, outcome: 'issued', serial: outcome.serial }
          : { ...base, outcome: 'skipped', reason: outcome.reason };
      } catch (error) {
        if (isEnrollmentClash(error)) {
          return { ...base, outcome: 'skipped', reason: 'already_issued' };
        }
        if (prismaCode(error) === 'P2034' && attempt < MAX_ATTEMPTS) continue;
        this.logger.error(
          `issue failed for enrollment ${candidate.enrollmentId}`,
          error instanceof Error ? error.stack : String(error),
        );
        return { ...base, outcome: 'failed', message: failureMessage(error) };
      }
    }
  }

  /** Everything for one learner, so it all commits or none of it does (D29). */
  private async issueInTransaction(
    tx: Prisma.TransactionClient,
    course: PreparedRun['course'],
    candidate: Candidate,
  ): Promise<
    { issued: true; serial: string } | { issued: false; reason: 'already_issued' | 'revoked' }
  > {
    const existing = await tx.certificate.findUnique({
      where: { enrollmentId: candidate.enrollmentId },
      select: { status: true },
    });
    if (existing) {
      // Never overwritten; no serial used, no audit entry.
      return { issued: false, reason: existing.status === 'revoked' ? 'revoked' : 'already_issued' };
    }

    const actor = this.ctx.actor;
    const issuedAt = this.ctx.now();
    const serial = await this.serials.next(tx, issuedAt);
    const certificate = await tx.certificate.create({
      data: {
        enrollmentId: candidate.enrollmentId,
        participantId: candidate.participantId,
        courseId: course.id,
        serial,
        participantName: candidate.participantName,
        courseTitle: course.title,
        issuedAt,
        issuedById: actor.id,
      },
      select: {
        id: true,
        serial: true,
        participantId: true,
        participantName: true,
        courseId: true,
        courseTitle: true,
      },
    });
    await this.audit.record(tx, { action: 'certificate.issued', certificate });
    return { issued: true, serial };
  }
}
