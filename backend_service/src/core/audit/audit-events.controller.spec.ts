import { AuditEventsController } from './audit-events.controller.js';
import type { AuditEventsService } from './audit-events.service.js';

describe('AuditEventsController', () => {
  it('lists with the validated query', async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [] }) };
    const controller = new AuditEventsController(service as unknown as AuditEventsService);
    const query = { page: 1, pageSize: 20, action: 'certificate.issued' } as const;
    await expect(controller.list(query)).resolves.toEqual({ items: [] });
    expect(service.list).toHaveBeenCalledWith(query);
  });
});
