import { CertificatesController } from './certificates.controller.js';
import type { CertificatesService } from './certificates.service.js';

describe('CertificatesController', () => {
  const service = { list: vi.fn(), get: vi.fn(), revoke: vi.fn() };

  it('revokes by the validated id with the validated body', async () => {
    service.revoke.mockResolvedValue({ id: 7, status: 'revoked' });
    await expect(controller.revoke({ id: 7 }, { reason: 'typo' })).resolves.toEqual({
      id: 7,
      status: 'revoked',
    });
    expect(service.revoke).toHaveBeenCalledWith(7, { reason: 'typo' });
  });
  const controller = new CertificatesController(service as unknown as CertificatesService);

  it('lists with the validated query', async () => {
    service.list.mockResolvedValue({ items: [] });
    const query = { page: 2, pageSize: 10, sort: 'serial', order: 'asc' } as const;
    await controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('gets by the validated id', async () => {
    service.get.mockResolvedValue({ id: 7 });
    await expect(controller.get({ id: 7 })).resolves.toEqual({ id: 7 });
    expect(service.get).toHaveBeenCalledWith(7);
  });
});
