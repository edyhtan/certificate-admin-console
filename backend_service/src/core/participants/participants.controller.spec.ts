import { ParticipantsController } from './participants.controller.js';
import type { ParticipantsService } from './participants.service.js';

describe('ParticipantsController', () => {
  it('creates through the service with the validated body', async () => {
    const participant = { id: 16, firstName: 'Ana', lastName: 'Lee', email: 'ana@x.com' };
    const service = { create: vi.fn().mockResolvedValue(participant) };
    const controller = new ParticipantsController(
      service as unknown as ParticipantsService,
    );
    const body = { firstName: 'Ana', lastName: 'Lee', email: 'ana@x.com' };
    await expect(controller.create(body)).resolves.toBe(participant);
    expect(service.create).toHaveBeenCalledWith(body);
  });
});
