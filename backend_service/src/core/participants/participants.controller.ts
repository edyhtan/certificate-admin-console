import {
  createParticipantRequestSchema,
  type CreateParticipant,
  type Participant,
} from '@cert/shared';
import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { ParticipantsService } from './participants.service.js';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createParticipantRequestSchema))
    body: CreateParticipant,
  ): Promise<Participant> {
    return this.participants.create(body);
  }
}
