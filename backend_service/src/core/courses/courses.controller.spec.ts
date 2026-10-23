import { CoursesController } from './courses.controller.js';
import type { CoursesService } from './courses.service.js';

describe('CoursesController', () => {
  const service = { list: vi.fn(), create: vi.fn() };
  const controller = new CoursesController(service as unknown as CoursesService);

  it('lists through the service', async () => {
    service.list.mockResolvedValue({ items: [] });
    await expect(controller.list()).resolves.toEqual({ items: [] });
  });

  it('creates through the service with the validated body', async () => {
    const course = { id: 4, code: 'FA-201', title: 'Advanced First Aid' };
    service.create.mockResolvedValue(course);
    await expect(
      controller.create({ code: 'FA-201', title: 'Advanced First Aid' }),
    ).resolves.toBe(course);
    expect(service.create).toHaveBeenCalledWith({
      code: 'FA-201',
      title: 'Advanced First Aid',
    });
  });
});
