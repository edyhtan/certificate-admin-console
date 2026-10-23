import { CertificatesController } from './certificates.controller.js';
import type { CertificatesService } from './certificates.service.js';

describe('CertificatesController', () => {
  const service = { list: vi.fn(), get: vi.fn() };
  const controller = new CertificatesController(service as unknown as CertificatesService);

  it('lists with the validated paging', async () => {
    service.list.mockResolvedValue({ items: [] });
    await controller.list({ page: 2, pageSize: 10 });
    expect(service.list).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
  });

  it('gets by the validated id', async () => {
    service.get.mockResolvedValue({ id: 7 });
    await expect(controller.get({ id: 7 })).resolves.toEqual({ id: 7 });
    expect(service.get).toHaveBeenCalledWith(7);
  });
});
