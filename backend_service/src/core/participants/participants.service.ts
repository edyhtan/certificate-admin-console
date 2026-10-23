import type { CreateParticipant, Participant } from '@cert/shared';
import { Injectable } from '@nestjs/common';
import { AppContext } from '../context/app-context.js';

@Injectable()
export class ParticipantsService {
  constructor(private readonly ctx: AppContext) {}

  /**
   * Input is already trimmed, and the email lower-cased, by the contract schema.
   * A duplicate email is decided by the unique index (P2002 → 409 naming `email`).
   */
  async create(input: CreateParticipant): Promise<Participant> {
    return this.ctx.db.participant.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }
}
